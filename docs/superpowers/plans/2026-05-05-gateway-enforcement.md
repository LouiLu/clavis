# Gateway Enforcement & Rate Limiting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the gateway from a blind reverse proxy into a real API gateway that validates API keys through the control plane, enforces route-level authorization, and applies Redis-backed token-bucket rate limiting per key.

**Architecture:** Extend the Go gateway in `apps/gateway` with a middleware chain: API key extraction, control plane validation (via HTTP client), route authorization, and Redis token-bucket rate limiting. The gateway becomes route-dynamic — service slugs are extracted from request paths and upstream targets come from the validation response, not from hardcoded configuration. The control plane requires zero changes; its validation endpoint is already complete.

**Tech Stack:** Go 1.23, chi v5, go-redis v9, `net/http/httputil.ReverseProxy`, `net/http/httptest` for tests, Docker Compose.

---

## Scope

This plan makes the gateway enforce API keys. It does not build the admin portal screens, does not add caching for validation results, and does not implement Redis Sentinel/Cluster for production HA. Those belong to later plans.

Acceptance target:

```bash
docker compose up -d --build
```

After startup:

- `GET http://localhost:8080/proxy/sample/health` without an API key returns **401**.
- `GET http://localhost:8080/proxy/sample/health` with an invalid key returns **401**.
- `GET http://localhost:8080/proxy/sample/health` with a valid key returns the sample backend response (**200**).
- `GET http://localhost:8080/proxy/sample/v1/jobs` with a key scoped to `GET /health` only returns **403**.
- Exceeding the rate limit returns **429** with `Retry-After` and rate-limit headers.
- `GET http://localhost:8080/health` still returns `{"status":"ok","service":"gateway"}` (no auth required).
- Rate-limit response headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) appear on proxied responses.
- `./scripts/smoke-compose.sh`, `pnpm test`, `pnpm build`, and `go test -race ./...` all pass.

## File Structure

Create or modify these files:

```text
apps/gateway
├── go.mod
├── go.sum
├── cmd
│   └── gateway
│       └── main.go              (modify — wire middleware chain, dynamic proxy)
├── internal
│   ├── config
│   │   └── config.go            (modify — add ControlPlaneURL, RedisURL)
│   ├── middleware
│   │   ├── auth.go              (create — API key extraction + validation + route check)
│   │   ├── auth_test.go         (create — table-driven tests)
│   │   ├── ratelimit.go         (create — Redis token-bucket rate limiter)
│   │   └── ratelimit_test.go    (create — tests with miniredis)
│   ├── proxy
│   │   └── proxy.go             (modify — dynamic routing from validation result)
│   └── validation
│       ├── client.go            (create — control plane HTTP client)
│       └── client_test.go       (create — tests with httptest server)
scripts
└── smoke-compose.sh             (modify — add gateway enforcement checks)
```

Responsibilities:

- `config`: reads `GATEWAY_PORT`, `SAMPLE_BACKEND_URL`, `REDIS_URL`, `CONTROL_PLANE_URL` from environment.
- `validation/client`: HTTP client that calls `POST /internal/v1/api-keys/validate` on the control plane and parses the response.
- `middleware/auth`: extracts API key from `Authorization: Bearer <key>` or `X-API-Key` header, extracts service slug from the URL path (`/proxy/{slug}/...`), calls the validation client, checks `allowed_routes` against the request method and path, and either returns 401/403 or injects the validation result into request context.
- `middleware/ratelimit`: reads the rate-limit policy from the validation result in context, applies token-bucket rate limiting in Redis keyed by `ratelimit:{api_key_id}`, sets rate-limit response headers, and returns 429 when the bucket is empty.
- `proxy`: creates a dynamic reverse proxy to the upstream `base_url` from the validation result, stripping the `/proxy/{slug}` prefix.

## Data Contracts

### API Key extraction

Clients send the API key in one of two ways:

```http
Authorization: Bearer pk_live_abcd1234.secret
```

or:

```http
X-API-Key: pk_live_abcd1234.secret
```

The `Authorization: Bearer` header takes precedence if both are present.

### Service slug extraction

The gateway extracts the service slug from the request path:

```text
/proxy/{service_slug}/...
```

Example: `GET /proxy/sample/health` → service slug = `sample`, upstream path = `/health`.

If the path does not match `/proxy/{slug}/...`, return **400 Bad Request**.

### Control plane validation (existing, unchanged)

Request:

```http
POST /internal/v1/api-keys/validate
Content-Type: application/json

{
  "api_key": "pk_live_abcd1234.secret",
  "service_slug": "sample",
  "method": "GET",
  "path": "/health"
}
```

Success response (HTTP 200):

```json
{
  "valid": true,
  "organization": { "id": "org_uuid" },
  "api_key": { "id": "key_uuid", "prefix": "pk_live_abcd1234" },
  "backend_service": {
    "id": "svc_uuid",
    "slug": "sample",
    "base_url": "http://sample-backend:6060",
    "allowed_routes": [{"method": "GET", "path": "/*"}]
  },
  "rate_limit": {
    "requests_per_interval": 1000,
    "interval_seconds": 60,
    "burst_size": 100
  }
}
```

Failure response (always HTTP 200):

```json
{
  "valid": false,
  "reason": "invalid_key"
}
```

### Gateway error responses

| Scenario | HTTP Status | Body |
|----------|-------------|------|
| Missing API key | 401 | `{"error":"missing_api_key","message":"An API key is required. Provide it via Authorization: Bearer <key> or X-API-Key header."}` |
| Invalid API key | 401 | `{"error":"invalid_api_key","message":"The provided API key is invalid or has been revoked."}` |
| Expired API key | 401 | `{"error":"expired_api_key","message":"The provided API key has expired."}` |
| Wrong service | 403 | `{"error":"service_not_allowed","message":"This API key is not authorized for the requested service."}` |
| Route not allowed | 403 | `{"error":"route_not_allowed","message":"This API key is not authorized for GET /v1/jobs on this service."}` |
| Service disabled | 403 | `{"error":"service_disabled","message":"The requested backend service is disabled."}` |
| Rate limit exceeded | 429 | `{"error":"rate_limit_exceeded","message":"Rate limit exceeded. Try again in 5 seconds."}` with `Retry-After` header |
| Control plane unreachable | 502 | `{"error":"gateway_error","message":"Unable to validate the API key. Please try again later."}` |
| Malformed path | 400 | `{"error":"bad_request","message":"Expected path format: /proxy/{service-slug}/{upstream-path}"}` |

### Rate limit response headers

All proxied responses include:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 99
X-RateLimit-Reset: 1712345678
```

### Request context keys

Middleware passes data to downstream handlers via `context.WithValue`:

| Context key | Type | Source |
|-------------|------|--------|
| `validation_result` | `*ValidationResult` | auth middleware after successful validation |

## Task 1: Gateway Configuration & Dependencies

**Files:**
- Modify: `apps/gateway/go.mod`
- Modify: `apps/gateway/internal/config/config.go`

- [ ] **Step 1: Add Redis dependency**

Run:

```bash
cd apps/gateway && go get github.com/redis/go-redis/v9
```

Expected: `go.mod` gains `require github.com/redis/go-redis/v9 v9.x.x` and `go.sum` is updated.

- [ ] **Step 2: Expand config**

Modify `apps/gateway/internal/config/config.go` to add `ControlPlaneURL` and `RedisURL`:

```go
package config

import "os"

type Config struct {
	Port             string
	SampleBackendURL string
	ControlPlaneURL  string
	RedisURL         string
}

func Load() Config {
	return Config{
		Port:             getenv("GATEWAY_PORT", "8080"),
		SampleBackendURL: getenv("SAMPLE_BACKEND_URL", "http://sample-backend:6060"),
		ControlPlaneURL:  getenv("CONTROL_PLANE_URL", "http://control-plane:4000"),
		RedisURL:         getenv("REDIS_URL", "redis://redis:6379"),
	}
}

func getenv(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}
```

- [ ] **Step 3: Verify build**

Run:

```bash
cd apps/gateway && go build ./...
```

Expected: build exits `0`.

- [ ] **Step 4: Commit**

Run:

```bash
git add apps/gateway/go.mod apps/gateway/go.sum apps/gateway/internal/config/config.go
git commit -m "feat: add gateway config for control plane and Redis"
```

## Task 2: Control Plane Validation HTTP Client

**Files:**
- Create: `apps/gateway/internal/validation/client.go`
- Create: `apps/gateway/internal/validation/client_test.go`

- [ ] **Step 1: Write the test first (TDD)**

Create `apps/gateway/internal/validation/client_test.go`:

```go
package validation_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"platform/gateway/internal/validation"
)

func TestValidate(t *testing.T) {
	t.Run("returns result for a valid key", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodPost {
				t.Errorf("expected POST, got %s", r.Method)
			}
			if r.URL.Path != "/internal/v1/api-keys/validate" {
				t.Errorf("expected /internal/v1/api-keys/validate, got %s", r.URL.Path)
			}

			var body map[string]string
			json.NewDecoder(r.Body).Decode(&body)
			if body["api_key"] != "pk_test.secret" {
				t.Errorf("expected pk_test.secret, got %s", body["api_key"])
			}
			if body["service_slug"] != "sample" {
				t.Errorf("expected sample, got %s", body["service_slug"])
			}

			json.NewEncoder(w).Encode(map[string]any{
				"valid": true,
				"api_key": map[string]string{
					"id":     "key_1",
					"prefix": "pk_test",
				},
				"backend_service": map[string]any{
					"id":       "svc_1",
					"slug":     "sample",
					"base_url": "http://upstream:6060",
					"allowed_routes": []map[string]string{
						{"method": "GET", "path": "/*"},
					},
				},
				"rate_limit": map[string]int{
					"requests_per_interval": 1000,
					"interval_seconds":      60,
					"burst_size":            100,
				},
			})
		}))
		defer srv.Close()

		client := validation.NewClient(srv.URL)
		result, err := client.Validate(validation.Input{
			APIKey:      "pk_test.secret",
			ServiceSlug: "sample",
			Method:      "GET",
			Path:        "/health",
		})

		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.Valid {
			t.Error("expected valid=true")
		}
		if result.BackendService.BaseURL != "http://upstream:6060" {
			t.Errorf("expected http://upstream:6060, got %s", result.BackendService.BaseURL)
		}
	})

	t.Run("returns invalid result for a revoked key", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			json.NewEncoder(w).Encode(map[string]any{
				"valid":  false,
				"reason": "unknown_or_inactive_key",
			})
		}))
		defer srv.Close()

		client := validation.NewClient(srv.URL)
		result, err := client.Validate(validation.Input{
			APIKey:      "pk_revoked.secret",
			ServiceSlug: "sample",
		})

		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result.Valid {
			t.Error("expected valid=false")
		}
	})

	t.Run("returns error when control plane is unreachable", func(t *testing.T) {
		client := validation.NewClient("http://127.0.0.1:1")
		_, err := client.Validate(validation.Input{
			APIKey:      "pk_test.secret",
			ServiceSlug: "sample",
		})

		if err == nil {
			t.Fatal("expected error for unreachable control plane")
		}
	})
}
```

Run and confirm it fails:

```bash
cd apps/gateway && go test ./internal/validation/...
```

Expected: FAIL (package or types don't exist yet).

- [ ] **Step 2: Implement the client**

Create `apps/gateway/internal/validation/client.go`:

```go
package validation

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type Input struct {
	APIKey      string `json:"api_key"`
	ServiceSlug string `json:"service_slug"`
	Method      string `json:"method,omitempty"`
	Path        string `json:"path,omitempty"`
}

type ValidationResult struct {
	Valid          bool                    `json:"valid"`
	Reason         string                  `json:"reason,omitempty"`
	Organization   *OrganizationRef        `json:"organization,omitempty"`
	APIKey         *APIKeyRef              `json:"api_key,omitempty"`
	BackendService *BackendServiceDetail   `json:"backend_service,omitempty"`
	RateLimit      *RateLimitPolicy        `json:"rate_limit,omitempty"`
}

type OrganizationRef struct {
	ID string `json:"id"`
}

type APIKeyRef struct {
	ID     string `json:"id"`
	Prefix string `json:"prefix"`
}

type RouteRule struct {
	Method string `json:"method"`
	Path   string `json:"path"`
}

type BackendServiceDetail struct {
	ID            string      `json:"id"`
	Slug          string      `json:"slug"`
	BaseURL       string      `json:"base_url"`
	AllowedRoutes []RouteRule `json:"allowed_routes"`
}

type RateLimitPolicy struct {
	RequestsPerInterval int `json:"requests_per_interval"`
	IntervalSeconds     int `json:"interval_seconds"`
	BurstSize           int `json:"burst_size"`
}

type Client struct {
	baseURL    string
	httpClient *http.Client
}

func NewClient(controlPlaneURL string) *Client {
	return &Client{
		baseURL: controlPlaneURL,
		httpClient: &http.Client{
			Timeout: 5 * time.Second,
		},
	}
}

func (c *Client) Validate(input Input) (*ValidationResult, error) {
	body, err := json.Marshal(input)
	if err != nil {
		return nil, fmt.Errorf("marshal validation request: %w", err)
	}

	url := fmt.Sprintf("%s/internal/v1/api-keys/validate", c.baseURL)
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create validation request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("call control plane: %w", err)
	}
	defer resp.Body.Close()

	var result ValidationResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode validation response: %w", err)
	}

	return &result, nil
}
```

- [ ] **Step 3: Run tests**

Run:

```bash
cd apps/gateway && go test -race ./internal/validation/...
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

Run:

```bash
git add apps/gateway/internal/validation/
git commit -m "feat: add control plane validation HTTP client"
```

## Task 3: Auth Middleware — Key Extraction, Validation, Route Check

**Files:**
- Create: `apps/gateway/internal/middleware/auth.go`
- Create: `apps/gateway/internal/middleware/auth_test.go`

- [ ] **Step 1: Write the test first**

Create `apps/gateway/internal/middleware/auth_test.go`:

```go
package middleware_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"platform/gateway/internal/middleware"
	"platform/gateway/internal/validation"
)

type stubValidator struct {
	result *validation.ValidationResult
	err    error
}

func (s *stubValidator) Validate(input validation.Input) (*validation.ValidationResult, error) {
	return s.result, s.err
}

func TestAuthMiddleware(t *testing.T) {
	t.Run("returns 401 when no API key is provided", func(t *testing.T) {
		handler := middleware.Auth(&stubValidator{})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			t.Error("handler should not be called")
		}))

		req := httptest.NewRequest(http.MethodGet, "/proxy/sample/health", nil)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusUnauthorized {
			t.Errorf("expected 401, got %d", rec.Code)
		}
	})

	t.Run("extracts API key from Authorization Bearer header", func(t *testing.T) {
		var capturedInput validation.Input
		v := &stubValidator{
			result: validResult(),
		}
		// Wrap to capture the input
		handler := middleware.Auth(&captureValidator{
			result: validResult(),
			capture: func(in validation.Input) {
				capturedInput = in
			},
		})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))

		req := httptest.NewRequest(http.MethodGet, "/proxy/sample/health", nil)
		req.Header.Set("Authorization", "Bearer pk_live_test.secret")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Errorf("expected 200, got %d", rec.Code)
		}
	})

	t.Run("extracts API key from X-API-Key header", func(t *testing.T) {
		handler := middleware.Auth(&stubValidator{result: validResult()})(
			http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusOK)
			}),
		)

		req := httptest.NewRequest(http.MethodGet, "/proxy/sample/health", nil)
		req.Header.Set("X-API-Key", "pk_live_test.secret")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Errorf("expected 200, got %d", rec.Code)
		}
	})

	t.Run("returns 401 for invalid API key", func(t *testing.T) {
		handler := middleware.Auth(&stubValidator{
			result: &validation.ValidationResult{Valid: false, Reason: "invalid_key"},
		})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			t.Error("handler should not be called")
		}))

		req := httptest.NewRequest(http.MethodGet, "/proxy/sample/health", nil)
		req.Header.Set("Authorization", "Bearer pk_bad.secret")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusUnauthorized {
			t.Errorf("expected 401, got %d", rec.Code)
		}
	})

	t.Run("returns 403 when service slug does not match", func(t *testing.T) {
		handler := middleware.Auth(&stubValidator{
			result: &validation.ValidationResult{Valid: false, Reason: "service_not_allowed"},
		})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			t.Error("handler should not be called")
		}))

		req := httptest.NewRequest(http.MethodGet, "/proxy/sample/health", nil)
		req.Header.Set("Authorization", "Bearer pk_live_test.secret")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusForbidden {
			t.Errorf("expected 403, got %d", rec.Code)
		}
	})

	t.Run("returns 403 for disallowed route", func(t *testing.T) {
		result := validResult()
		result.BackendService.AllowedRoutes = []validation.RouteRule{
			{Method: "GET", Path: "/health"},
		}
		handler := middleware.Auth(&stubValidator{result: result})(
			http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				t.Error("handler should not be called for disallowed route")
			}),
		)

		req := httptest.NewRequest(http.MethodGet, "/proxy/sample/v1/jobs", nil)
		req.Header.Set("Authorization", "Bearer pk_live_test.secret")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusForbidden {
			t.Errorf("expected 403 for disallowed route, got %d", rec.Code)
		}
	})

	t.Run("injects validation result into context on success", func(t *testing.T) {
		result := validResult()
		handler := middleware.Auth(&stubValidator{result: result})(
			http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				ctxResult := middleware.GetValidationResult(r.Context())
				if ctxResult == nil {
					t.Error("expected validation result in context")
				}
				if ctxResult.BackendService.Slug != "sample" {
					t.Errorf("expected slug sample, got %s", ctxResult.BackendService.Slug)
				}
				w.WriteHeader(http.StatusOK)
			}),
		)

		req := httptest.NewRequest(http.MethodGet, "/proxy/sample/health", nil)
		req.Header.Set("Authorization", "Bearer pk_live_test.secret")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Errorf("expected 200, got %d", rec.Code)
		}
	})

	t.Run("returns 502 when validation client errors", func(t *testing.T) {
		handler := middleware.Auth(&stubValidator{
			err: context.DeadlineExceeded,
		})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			t.Error("handler should not be called")
		}))

		req := httptest.NewRequest(http.MethodGet, "/proxy/sample/health", nil)
		req.Header.Set("Authorization", "Bearer pk_live_test.secret")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadGateway {
			t.Errorf("expected 502, got %d", rec.Code)
		}
	})
}

func validResult() *validation.ValidationResult {
	return &validation.ValidationResult{
		Valid: true,
		APIKey: &validation.APIKeyRef{
			ID:     "key_1",
			Prefix: "pk_live_test",
		},
		BackendService: &validation.BackendServiceDetail{
			ID:      "svc_1",
			Slug:    "sample",
			BaseURL: "http://sample-backend:6060",
			AllowedRoutes: []validation.RouteRule{
				{Method: "GET", Path: "/*"},
			},
		},
		RateLimit: &validation.RateLimitPolicy{
			RequestsPerInterval: 1000,
			IntervalSeconds:     60,
			BurstSize:           100,
		},
	}
}

// captureValidator wraps a stub and captures the validation input.
type captureValidator struct {
	result  *validation.ValidationResult
	capture func(validation.Input)
}

func (c *captureValidator) Validate(input validation.Input) (*validation.ValidationResult, error) {
	if c.capture != nil {
		c.capture(input)
	}
	return c.result, nil
}
```

Run and confirm it fails:

```bash
cd apps/gateway && go test -race ./internal/middleware/...
```

Expected: FAIL (package or types don't exist yet).

- [ ] **Step 2: Define the Validator interface and implement the auth middleware**

Create `apps/gateway/internal/middleware/auth.go`:

```go
package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"platform/gateway/internal/validation"
)

// Validator is the interface for API key validation.
type Validator interface {
	Validate(input validation.Input) (*validation.ValidationResult, error)
}

type contextKey string

const validationResultKey contextKey = "validation_result"

// GetValidationResult retrieves the validation result from the request context.
func GetValidationResult(ctx context.Context) *validation.ValidationResult {
	result, _ := ctx.Value(validationResultKey).(*validation.ValidationResult)
	return result
}

// Auth returns middleware that extracts an API key, validates it against the
// control plane, checks route authorization, and injects the result into context.
func Auth(validator Validator) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			apiKey := extractAPIKey(r)
			if apiKey == "" {
				writeError(w, http.StatusUnauthorized, "missing_api_key",
					"An API key is required. Provide it via Authorization: Bearer <key> or X-API-Key header.")
				return
			}

			slug, upstreamPath := extractServiceSlug(r.URL.Path)
			if slug == "" {
				writeError(w, http.StatusBadRequest, "bad_request",
					"Expected path format: /proxy/{service-slug}/{upstream-path}")
				return
			}

			result, err := validator.Validate(validation.Input{
				APIKey:      apiKey,
				ServiceSlug: slug,
				Method:      r.Method,
				Path:        upstreamPath,
			})
			if err != nil {
				writeError(w, http.StatusBadGateway, "gateway_error",
					"Unable to validate the API key. Please try again later.")
				return
			}

			if !result.Valid {
				code, codeStr, msg := mapValidationFailure(result.Reason)
				writeError(w, code, codeStr, msg)
				return
			}

			if !routeAllowed(result.BackendService.AllowedRoutes, r.Method, upstreamPath) {
				writeError(w, http.StatusForbidden, "route_not_allowed",
					"This API key is not authorized for "+r.Method+" "+upstreamPath+" on this service.")
				return
			}

			ctx := context.WithValue(r.Context(), validationResultKey, result)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func extractAPIKey(r *http.Request) string {
	if auth := r.Header.Get("Authorization"); strings.HasPrefix(auth, "Bearer ") {
		return auth[7:]
	}
	if key := r.Header.Get("X-API-Key"); key != "" {
		return key
	}
	return ""
}

// extractServiceSlug parses /proxy/{slug}/rest/of/path and returns (slug, upstreamPath).
func extractServiceSlug(urlPath string) (slug string, upstreamPath string) {
	parts := strings.SplitN(strings.TrimPrefix(urlPath, "/"), "/", 4)
	if len(parts) < 3 || parts[0] != "proxy" {
		return "", ""
	}
	upstreamPath = "/"
	if len(parts) >= 3 {
		upstreamPath = "/" + strings.Join(parts[2:], "/")
	}
	return parts[1], upstreamPath
}

func routeAllowed(rules []validation.RouteRule, method string, path string) bool {
	for _, rule := range rules {
		if rule.Method != method {
			continue
		}
		if matchPath(rule.Path, path) {
			return true
		}
	}
	return false
}

// matchPath does simple glob matching: "/*" matches everything, "/v1/*" matches "/v1/..." etc.
func matchPath(pattern string, path string) bool {
	if pattern == "/*" {
		return true
	}
	if strings.HasSuffix(pattern, "/*") {
		prefix := strings.TrimSuffix(pattern, "/*")
		return strings.HasPrefix(path, prefix+"/") || path == prefix
	}
	return pattern == path
}

func mapValidationFailure(reason string) (int, string, string) {
	switch reason {
	case "unknown_or_inactive_key", "invalid_key":
		return http.StatusUnauthorized, "invalid_api_key",
			"The provided API key is invalid or has been revoked."
	case "expired_key":
		return http.StatusUnauthorized, "expired_api_key",
			"The provided API key has expired."
	case "service_not_allowed":
		return http.StatusForbidden, "service_not_allowed",
			"This API key is not authorized for the requested service."
	default:
		return http.StatusUnauthorized, "invalid_api_key",
			"The provided API key is invalid."
	}
}

func writeError(w http.ResponseWriter, status int, code string, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{
		"error":   code,
		"message": message,
	})
}
```

- [ ] **Step 3: Run tests**

Run:

```bash
cd apps/gateway && go test -race ./internal/middleware/...
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

Run:

```bash
git add apps/gateway/internal/middleware/auth.go apps/gateway/internal/middleware/auth_test.go
git commit -m "feat: add API key auth middleware with route authorization"
```

## Task 4: Redis Token-Bucket Rate Limiter Middleware

**Files:**
- Create: `apps/gateway/internal/middleware/ratelimit.go`
- Create: `apps/gateway/internal/middleware/ratelimit_test.go`

- [ ] **Step 1: Write the test first**

Create `apps/gateway/internal/middleware/ratelimit_test.go`:

```go
package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"

	"platform/gateway/internal/middleware"
	"platform/gateway/internal/validation"
)

func TestRateLimit(t *testing.T) {
	setup := func() (*redis.Client, func()) {
		mr, err := miniredis.Run()
		if err != nil {
			t.Fatal(err)
		}
		client := redis.NewClient(&redis.Options{Addr: mr.Addr()})
		return client, func() { mr.Close(); client.Close() }
	}

	validCtx := func() *http.Request {
		req := httptest.NewRequest(http.MethodGet, "/proxy/sample/health", nil)
		ctx := middleware.WithValidationResult(req.Context(), &validation.ValidationResult{
			APIKey: &validation.APIKeyRef{ID: "key_1"},
			RateLimit: &validation.RateLimitPolicy{
				RequestsPerInterval: 10,
				IntervalSeconds:     60,
				BurstSize:           3,
			},
		})
		return req.WithContext(ctx)
	}

	t.Run("allows requests within limit", func(t *testing.T) {
		client, teardown := setup()
		defer teardown()

		handler := middleware.RateLimit(client)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))

		for i := 0; i < 3; i++ {
			req := validCtx()
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)
			if rec.Code != http.StatusOK {
				t.Errorf("request %d: expected 200, got %d", i+1, rec.Code)
			}
		}
	})

	t.Run("returns 429 when burst is exceeded", func(t *testing.T) {
		client, teardown := setup()
		defer teardown()

		handler := middleware.RateLimit(client)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))

		// Exhaust the burst (3 requests).
		for i := 0; i < 3; i++ {
			req := validCtx()
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)
		}

		// 4th request should be rate limited.
		req := validCtx()
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusTooManyRequests {
			t.Errorf("expected 429, got %d", rec.Code)
		}
		if rec.Header().Get("Retry-After") == "" {
			t.Error("expected Retry-After header")
		}
	})

	t.Run("sets rate limit headers on allowed requests", func(t *testing.T) {
		client, teardown := setup()
		defer teardown()

		handler := middleware.RateLimit(client)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))

		req := validCtx()
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Header().Get("X-RateLimit-Limit") != "3" {
			t.Errorf("expected X-RateLimit-Limit=3, got %s", rec.Header().Get("X-RateLimit-Limit"))
		}
		if rec.Header().Get("X-RateLimit-Remaining") != "2" {
			t.Errorf("expected X-RateLimit-Remaining=2, got %s", rec.Header().Get("X-RateLimit-Remaining"))
		}
	})

	t.Run("skips rate limiting when no rate limit policy in context", func(t *testing.T) {
		client, teardown := setup()
		defer teardown()

		handler := middleware.RateLimit(client)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))

		req := httptest.NewRequest(http.MethodGet, "/proxy/sample/health", nil)
		ctx := middleware.WithValidationResult(req.Context(), &validation.ValidationResult{
			APIKey:    &validation.APIKeyRef{ID: "key_1"},
			RateLimit: nil,
		})
		req = req.WithContext(ctx)

		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Errorf("expected 200, got %d", rec.Code)
		}
	})
}
```

Run and confirm it fails:

```bash
cd apps/gateway && go get github.com/alicebob/miniredis/v2 && go test -race ./internal/middleware/...
```

Expected: FAIL (RateLimit function and WithValidationResult don't exist yet).

- [ ] **Step 2: Implement the rate limiter middleware**

Create `apps/gateway/internal/middleware/ratelimit.go`:

```go
package middleware

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"

	"platform/gateway/internal/validation"
)

// WithValidationResult injects a validation result into the context (for testing).
func WithValidationResult(ctx context.Context, result *validation.ValidationResult) context.Context {
	return context.WithValue(ctx, validationResultKey, result)
}

// RateLimit returns middleware that enforces token-bucket rate limiting per API key.
// It reads the rate limit policy from the validation result in context.
func RateLimit(rdb *redis.Client) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			result := GetValidationResult(r.Context())
			if result == nil || result.RateLimit == nil {
				next.ServeHTTP(w, r)
				return
			}

			policy := result.RateLimit
			key := fmt.Sprintf("ratelimit:%s", result.APIKey.ID)
			limit := policy.BurstSize
			rate := float64(policy.RequestsPerInterval) / float64(policy.IntervalSeconds)
			now := time.Now().Unix()

			allowed, remaining, retryAfter, err := checkTokenBucket(r.Context(), rdb, key, rate, limit, now)
			if err != nil {
				// Redis error: fail open. Logging would go here.
				next.ServeHTTP(w, r)
				return
			}

			setRateLimitHeaders(w, limit, remaining, now+int64(policy.IntervalSeconds))

			if !allowed {
				w.Header().Set("Retry-After", strconv.Itoa(retryAfter))
				writeError(w, http.StatusTooManyRequests, "rate_limit_exceeded",
					fmt.Sprintf("Rate limit exceeded. Try again in %d seconds.", retryAfter))
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// checkTokenBucket runs the token bucket Lua script against Redis.
// Returns (allowed, remaining, retryAfterSeconds, error).
func checkTokenBucket(ctx context.Context, rdb *redis.Client, key string, rate float64, burst int, now int64) (bool, int, int, error) {
	script := redis.NewScript(`
		local key = KEYS[1]
		local rate = tonumber(ARGV[1])
		local burst = tonumber(ARGV[2])
		local now = tonumber(ARGV[3])
		local requested = 1

		local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
		local tokens = tonumber(bucket[1])
		if tokens == nil then
			tokens = burst
		end
		local last_refill = tonumber(bucket[2])
		if last_refill == nil then
			last_refill = now
		end

		local elapsed = now - last_refill
		tokens = math.min(burst, tokens + elapsed * rate)
		local ttl = math.max(1, math.ceil(burst / rate))

		if tokens >= requested then
			tokens = tokens - requested
			redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
			redis.call('EXPIRE', key, ttl)
			return {1, math.floor(tokens)}
		else
			local retry_after = math.ceil((requested - tokens) / rate)
			return {0, retry_after}
		end
	`)

	result, err := script.Run(ctx, rdb, []string{key}, rate, burst, now).Result()
	if err != nil {
		return false, 0, 0, fmt.Errorf("redis token bucket: %w", err)
	}

	values, ok := result.([]interface{})
	if !ok || len(values) != 2 {
		return false, 0, 0, fmt.Errorf("unexpected redis response: %v", result)
	}

	allowed, _ := values[0].(int64)
	second, _ := values[1].(int64)

	if allowed == 1 {
		return true, int(second), 0, nil
	}
	return false, 0, int(second), nil
}

func setRateLimitHeaders(w http.ResponseWriter, limit int, remaining int, resetUnix int64) {
	w.Header().Set("X-RateLimit-Limit", strconv.Itoa(limit))
	w.Header().Set("X-RateLimit-Remaining", strconv.Itoa(remaining))
	w.Header().Set("X-RateLimit-Reset", strconv.FormatInt(resetUnix, 10))
}
```

- [ ] **Step 3: Run tests**

Run:

```bash
cd apps/gateway && go test -race ./internal/middleware/...
```

Expected: all tests PASS (both auth and ratelimit).

- [ ] **Step 4: Commit**

Run:

```bash
git add apps/gateway/internal/middleware/ratelimit.go apps/gateway/internal/middleware/ratelimit_test.go
git commit -m "feat: add Redis token-bucket rate limiter middleware"
```

## Task 5: Dynamic Proxy Handler

**Files:**
- Modify: `apps/gateway/internal/proxy/proxy.go`

- [ ] **Step 1: Update proxy to use validation context**

Modify `apps/gateway/internal/proxy/proxy.go` to create a dynamic proxy from context instead of hardcoding the target:

```go
package proxy

import (
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"

	"platform/gateway/internal/middleware"
)

// NewDynamicProxy creates a reverse proxy handler that reads the upstream
// base URL from the validation result in context and strips the /proxy/{slug} prefix.
func NewDynamicProxy() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		result := middleware.GetValidationResult(r.Context())
		if result == nil || result.BackendService == nil {
			http.Error(w, `{"error":"gateway_error","message":"No validated upstream target"}`, http.StatusBadGateway)
			return
		}

		targetURL, err := url.Parse(result.BackendService.BaseURL)
		if err != nil {
			http.Error(w, `{"error":"gateway_error","message":"Invalid upstream URL"}`, http.StatusBadGateway)
			return
		}

		stripPrefix := "/proxy/" + result.BackendService.Slug

		proxy := httputil.NewSingleHostReverseProxy(targetURL)
		originalDirector := proxy.Director
		proxy.Director = func(req *http.Request) {
			originalDirector(req)
			req.URL.Path = strings.TrimPrefix(req.URL.Path, stripPrefix)
			if req.URL.Path == "" {
				req.URL.Path = "/"
			}
			req.Host = targetURL.Host
			req.Header.Set("X-Platform-Service-Slug", result.BackendService.Slug)
			req.Header.Set("X-Platform-API-Key-ID", result.APIKey.ID)
		}

		proxy.ServeHTTP(w, r)
	})
}
```

- [ ] **Step 2: Verify build**

Run:

```bash
cd apps/gateway && go build ./...
```

Expected: build exits `0`.

- [ ] **Step 3: Commit**

Run:

```bash
git add apps/gateway/internal/proxy/proxy.go
git commit -m "feat: add dynamic proxy routing from validation context"
```

## Task 6: Wire Middleware Chain in main.go

**Files:**
- Modify: `apps/gateway/cmd/gateway/main.go`

- [ ] **Step 1: Update main.go with full middleware chain**

Modify `apps/gateway/cmd/gateway/main.go`:

```go
package main

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/redis/go-redis/v9"

	"platform/gateway/internal/config"
	"platform/gateway/internal/middleware"
	"platform/gateway/internal/proxy"
	"platform/gateway/internal/validation"
)

func main() {
	cfg := config.Load()

	validationClient := validation.NewClient(cfg.ControlPlaneURL)

	redisClient := redis.NewClient(&redis.Options{
		Addr: cfg.RedisURL,
	})
	defer redisClient.Close()

	dynamicProxy := proxy.NewDynamicProxy()

	router := chi.NewRouter()

	router.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{
			"status":  "ok",
			"service": "gateway",
		})
	})

	// Protected proxy path: API key auth → rate limiting → proxy to upstream.
	router.With(
		middleware.Auth(validationClient),
		middleware.RateLimit(redisClient),
	).Handle("/proxy/*", dynamicProxy)

	log.Printf("gateway listening on :%s", cfg.Port)
	log.Fatal(http.ListenAndServe(":"+cfg.Port, router))
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		log.Printf("encode response: %v", err)
	}
}
```

- [ ] **Step 2: Verify build**

Run:

```bash
cd apps/gateway && go build ./...
```

Expected: build exits `0`.

- [ ] **Step 3: Run all gateway tests**

Run:

```bash
cd apps/gateway && go test -race ./...
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

Run:

```bash
git add apps/gateway/cmd/gateway/main.go
git commit -m "feat: wire auth and rate limit middleware into gateway"
```

## Task 7: Update Docker Compose & .env.example

**Files:**
- Modify: `docker-compose.yml`
- Modify: `.env.example`

- [ ] **Step 1: Add gateway env vars to .env.example**

Add to `.env.example`:

```dotenv
# Gateway — control plane URL for in-cluster communication
GATEWAY_CONTROL_PLANE_URL=http://control-plane:4000
# Gateway — Redis URL for rate limiting
GATEWAY_REDIS_URL=redis://redis:6379
```

- [ ] **Step 2: Update gateway service in docker-compose.yml**

Update the `gateway` service environment to use the new env vars:

```yaml
gateway:
  build:
    context: .
    dockerfile: apps/gateway/Dockerfile
  environment:
    GATEWAY_PORT: ${GATEWAY_PORT:-8080}
    REDIS_URL: ${GATEWAY_REDIS_URL:-redis://redis:6379}
    CONTROL_PLANE_URL: ${GATEWAY_CONTROL_PLANE_URL:-http://control-plane:4000}
  ports:
    - "${GATEWAY_PORT:-8080}:8080"
  depends_on:
    redis:
      condition: service_healthy
    control-plane:
      condition: service_healthy
    sample-backend:
      condition: service_healthy
  healthcheck:
    test: ["CMD-SHELL", "wget -qO- http://localhost:8080/health"]
    interval: 10s
    timeout: 5s
    retries: 20
```

Note: Remove the unused `SAMPLE_BACKEND_URL` from gateway environment since the upstream URL now comes from the control plane validation response.

- [ ] **Step 3: Verify Compose config**

Run:

```bash
docker compose config
```

Expected: command exits `0` and gateway service shows the updated env vars.

- [ ] **Step 4: Commit**

Run:

```bash
git add docker-compose.yml .env.example
git commit -m "chore: add gateway env vars for control plane and Redis"
```

## Task 8: Update Smoke Tests For Gateway Enforcement

**Files:**
- Modify: `scripts/smoke-compose.sh`

- [ ] **Step 1: Add gateway enforcement smoke checks**

Extend `scripts/smoke-compose.sh` after the existing "Validating API key..." block. Add:

```bash
echo "Checking gateway enforcement — missing key returns 401..."
HTTP_CODE="$(curl --silent --show-error -o /dev/null -w '%{http_code}' http://localhost:8080/proxy/sample/health)"
test "${HTTP_CODE}" = "401" || { echo "Expected 401 for missing key, got ${HTTP_CODE}"; exit 1; }

echo "Checking gateway enforcement — invalid key returns 401..."
HTTP_CODE="$(curl --silent --show-error -o /dev/null -w '%{http_code}' http://localhost:8080/proxy/sample/health -H 'authorization: Bearer pk_live_bad.invalidkey12345678901234567890')"
test "${HTTP_CODE}" = "401" || { echo "Expected 401 for invalid key, got ${HTTP_CODE}"; exit 1; }

echo "Checking gateway enforcement — valid key returns 200..."
HTTP_CODE="$(curl --silent --show-error -o /dev/null -w '%{http_code}' http://localhost:8080/proxy/sample/health -H "authorization: Bearer ${API_KEY}")"
test "${HTTP_CODE}" = "200" || { echo "Expected 200 for valid key, got ${HTTP_CODE}"; exit 1; }

echo "Checking gateway enforcement — valid proxy returns rate-limit headers..."
curl --fail --silent --show-error http://localhost:8080/proxy/sample/health -H "authorization: Bearer ${API_KEY}" -i | grep 'X-RateLimit-Limit'

echo "Checking gateway enforcement — valid proxy returns upstream response..."
curl --fail --silent --show-error http://localhost:8080/proxy/sample/health -H "authorization: Bearer ${API_KEY}" | grep '"service":"sample-backend"'
```

- [ ] **Step 2: Run full Compose verification**

Run:

```bash
docker compose down -v
cp .env.example .env
docker compose up -d --build
./scripts/smoke-compose.sh
```

Expected: all smoke checks pass, including the new enforcement checks.

- [ ] **Step 3: Run all tests**

Run:

```bash
pnpm test
pnpm build
pnpm --filter @platform/control-plane lint
cd apps/gateway && go test -race ./...
cd ../sample-backend && go test ./...
```

Expected: all commands exit `0`.

- [ ] **Step 4: Commit**

Run:

```bash
git add scripts/smoke-compose.sh
git commit -m "test: add gateway enforcement smoke checks"
```

## Self-Review Checklist

- Spec coverage:
  - Missing API key → 401 is covered by Task 3 and Task 8.
  - Invalid API key → 401 is covered by Task 3 and Task 8.
  - Wrong service → 403 is covered by Task 3.
  - Route not allowed → 403 is covered by Task 3.
  - Rate limit exceeded → 429 is covered by Task 4.
  - Control plane unreachable → 502 is covered by Task 3.
  - Rate-limit response headers are covered by Task 4.
  - Dynamic proxy routing from validation response is covered by Task 5.
  - Middleware chain wiring is covered by Task 6.
  - Compose smoke verification is covered by Task 8.
- Deferred by design:
  - Admin portal screens.
  - Validation result caching in the gateway.
  - Redis sentinel/cluster for HA.
  - Public registration, password reset, SSO.
  - Logging/monitoring infrastructure.
- Test coverage:
  - Validation client: 3 test cases (valid, invalid, unreachable).
  - Auth middleware: 7 test cases (missing key, Bearer, X-API-Key, invalid key, wrong service, disallowed route, context injection, client error).
  - Rate limit middleware: 4 test cases (within limit, exceeded, response headers, no policy skip).
  - All Go tests run with `-race` flag.
- Placeholder scan:
  - No `TBD`, `TODO`, or unspecified implementation steps.
- Type consistency:
  - Go struct tags match JSON field names from the control plane validation response.
  - Gateway error response format matches the control plane error envelope pattern.
  - Redis key pattern `ratelimit:{api_key_id}` avoids collisions.
