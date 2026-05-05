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
