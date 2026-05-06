package middleware_test

import (
	"context"
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

func (s *stubValidator) Validate(_ validation.Input) (*validation.ValidationResult, error) {
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
		handler := middleware.Auth(&stubValidator{result: validResult()})(
			http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusOK)
			}),
		)

		req := httptest.NewRequest(http.MethodGet, "/proxy/sample/health", nil)
		req.Header.Set("Authorization", "Bearer pk_test_xxxx.secret")
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
		req.Header.Set("X-API-Key", "pk_test_xxxx.secret")
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
		req.Header.Set("Authorization", "Bearer pk_test_xxxx.secret")
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
		req.Header.Set("Authorization", "Bearer pk_test_xxxx.secret")
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
					t.Fatal("expected validation result in context")
				}
				if ctxResult.BackendService.Slug != "sample" {
					t.Errorf("expected slug sample, got %s", ctxResult.BackendService.Slug)
				}
				w.WriteHeader(http.StatusOK)
			}),
		)

		req := httptest.NewRequest(http.MethodGet, "/proxy/sample/health", nil)
		req.Header.Set("Authorization", "Bearer pk_test_xxxx.secret")
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
		req.Header.Set("Authorization", "Bearer pk_test_xxxx.secret")
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
			Prefix: "pk_test_xxxx",
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
