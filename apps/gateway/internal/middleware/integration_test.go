package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/go-chi/chi/v5"
	"github.com/redis/go-redis/v9"

	"platform/gateway/internal/middleware"
	"platform/gateway/internal/proxy"
	"platform/gateway/internal/validation"
)

func TestMiddlewareChainWithReverseProxy(t *testing.T) {
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatal(err)
	}
	defer mr.Close()
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	defer rdb.Close()

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	}))
	defer upstream.Close()

	validator := &stubValidator{
		result: &validation.ValidationResult{
			Valid: true,
			APIKey: &validation.APIKeyRef{
				ID:     "key_1",
				Prefix: "pk_test",
			},
			BackendService: &validation.BackendServiceDetail{
				ID:            "svc_1",
				Slug:          "sample",
				BaseURL:       upstream.URL,
				AllowedRoutes: []validation.RouteRule{{Method: "GET", Path: "/*"}},
			},
			RateLimit: &validation.RateLimitPolicy{
				RequestsPerInterval: 10,
				IntervalSeconds:     60,
				BurstSize:           3,
			},
		},
	}

	r := chi.NewRouter()
	r.With(
		middleware.Auth(validator),
		middleware.RateLimit(rdb),
	).Handle("/proxy/*", proxy.NewDynamicProxy())

	t.Run("rate limit headers survive reverse proxy", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/proxy/sample/health", nil)
		req.Header.Set("Authorization", "Bearer pk_test.secret")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
		if rec.Header().Get("X-RateLimit-Limit") == "" {
			t.Error("X-RateLimit-Limit header missing with reverse proxy")
		}
		if rec.Header().Get("X-RateLimit-Remaining") == "" {
			t.Error("X-RateLimit-Remaining header missing with reverse proxy")
		}
	})

	t.Run("returns 429 after exhausting burst", func(t *testing.T) {
		for i := 0; i < 3; i++ {
			req := httptest.NewRequest(http.MethodGet, "/proxy/sample/health", nil)
			req.Header.Set("Authorization", "Bearer pk_test.secret")
			rec := httptest.NewRecorder()
			r.ServeHTTP(rec, req)
		}

		req := httptest.NewRequest(http.MethodGet, "/proxy/sample/health", nil)
		req.Header.Set("Authorization", "Bearer pk_test.secret")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusTooManyRequests {
			t.Errorf("expected 429, got %d", rec.Code)
		}
	})
}
