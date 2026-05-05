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

func newRedisClient(t *testing.T) (*redis.Client, func()) {
	t.Helper()
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatal(err)
	}
	client := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	return client, func() { mr.Close(); client.Close() }
}

func validCtx(t *testing.T) *http.Request {
	t.Helper()
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

func TestRateLimit(t *testing.T) {
	t.Run("allows requests within limit", func(t *testing.T) {
		client, teardown := newRedisClient(t)
		defer teardown()

		handler := middleware.RateLimit(client)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))

		for i := 0; i < 3; i++ {
			req := validCtx(t)
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)
			if rec.Code != http.StatusOK {
				t.Errorf("request %d: expected 200, got %d", i+1, rec.Code)
			}
		}
	})

	t.Run("returns 429 when burst is exceeded", func(t *testing.T) {
		client, teardown := newRedisClient(t)
		defer teardown()

		handler := middleware.RateLimit(client)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))

		for i := 0; i < 3; i++ {
			req := validCtx(t)
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)
		}

		req := validCtx(t)
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
		client, teardown := newRedisClient(t)
		defer teardown()

		handler := middleware.RateLimit(client)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))

		req := validCtx(t)
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
		client, teardown := newRedisClient(t)
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
