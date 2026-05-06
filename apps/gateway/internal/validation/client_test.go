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
			_ = json.NewDecoder(r.Body).Decode(&body)
			if body["api_key"] != "pk_test.secret" {
				t.Errorf("expected pk_test.secret, got %s", body["api_key"])
			}
			if body["service_slug"] != "sample" {
				t.Errorf("expected sample, got %s", body["service_slug"])
			}

			_ = json.NewEncoder(w).Encode(map[string]any{
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
			_ = json.NewEncoder(w).Encode(map[string]any{
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

	t.Run("lookup returns service info for a valid key", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/internal/v1/api-keys/lookup" {
				t.Errorf("expected /internal/v1/api-keys/lookup, got %s", r.URL.Path)
			}

			var body map[string]string
			_ = json.NewDecoder(r.Body).Decode(&body)
			if body["api_key"] != "pk_test.secret" {
				t.Errorf("expected pk_test.secret, got %s", body["api_key"])
			}

			_ = json.NewEncoder(w).Encode(map[string]any{
				"valid": true,
				"api_key": map[string]string{
					"id":     "key_1",
					"prefix": "pk_test",
				},
				"backend_service": map[string]any{
					"id":       "svc_1",
					"slug":     "my-service",
					"base_url": "http://upstream:3130",
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
		result, err := client.Lookup(validation.LookupInput{APIKey: "pk_test.secret"})

		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.Valid {
			t.Error("expected valid=true")
		}
		if result.BackendService.BaseURL != "http://upstream:3130" {
			t.Errorf("expected http://upstream:3130, got %s", result.BackendService.BaseURL)
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
