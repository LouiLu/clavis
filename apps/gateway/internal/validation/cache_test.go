package validation_test

import (
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"platform/gateway/internal/validation"
)

func TestCachingClientValidate(t *testing.T) {
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"valid":true,"api_key":{"id":"k1","prefix":"pk_test"},"backend_service":{"id":"s1","slug":"sample","base_url":"http://up:6060","allowed_routes":[{"method":"GET","path":"/*"}]}}`))
	}))
	defer srv.Close()

	inner := validation.NewClient(srv.URL)
	cache := validation.NewCachingClient(inner, 1*time.Second, 100*time.Millisecond)
	defer cache.Stop()

	input := validation.Input{APIKey: "pk.key1", ServiceSlug: "sample"}

	// First call — cache miss, hits server.
	result, err := cache.Validate(input)
	if err != nil || !result.Valid {
		t.Fatal("expected valid result")
	}
	if n := atomic.LoadInt32(&calls); n != 1 {
		t.Fatalf("expected 1 server call, got %d", n)
	}

	// Second call — cache hit, no server call.
	result, err = cache.Validate(input)
	if err != nil || !result.Valid {
		t.Fatal("expected valid result from cache")
	}
	if n := atomic.LoadInt32(&calls); n != 1 {
		t.Fatalf("expected still 1 server call, got %d", n)
	}

	// Different service slug — different cache key, new server call.
	result, err = cache.Validate(validation.Input{APIKey: "pk.key1", ServiceSlug: "other"})
	if err != nil || !result.Valid {
		t.Fatal("expected valid result for different service")
	}
	if n := atomic.LoadInt32(&calls); n != 2 {
		t.Fatalf("expected 2 server calls, got %d", n)
	}
}

func TestCachingClientNegativeCache(t *testing.T) {
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"valid":false,"reason":"invalid_key"}`))
	}))
	defer srv.Close()

	inner := validation.NewClient(srv.URL)
	cache := validation.NewCachingClient(inner, 1*time.Second, 100*time.Millisecond)
	defer cache.Stop()

	input := validation.Input{APIKey: "pk.bad", ServiceSlug: "sample"}

	result, err := cache.Validate(input)
	if err != nil || result.Valid {
		t.Fatal("expected invalid result")
	}
	if n := atomic.LoadInt32(&calls); n != 1 {
		t.Fatalf("expected 1 call, got %d", n)
	}

	result, err = cache.Validate(input)
	if err != nil || result.Valid {
		t.Fatal("expected cached invalid result")
	}
	if n := atomic.LoadInt32(&calls); n != 1 {
		t.Fatalf("expected still 1 call (negative cache), got %d", n)
	}
}

func TestCachingClientTTLExpiry(t *testing.T) {
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"valid":true,"api_key":{"id":"k1","prefix":"pk_test"},"backend_service":{"id":"s1","slug":"sample","base_url":"http://up:6060","allowed_routes":[{"method":"GET","path":"/*"}]}}`))
	}))
	defer srv.Close()

	inner := validation.NewClient(srv.URL)
	cache := validation.NewCachingClient(inner, 50*time.Millisecond, 50*time.Millisecond)
	defer cache.Stop()

	input := validation.Input{APIKey: "pk.key1", ServiceSlug: "sample"}

	_, _ = cache.Validate(input) // call 1
	if n := atomic.LoadInt32(&calls); n != 1 {
		t.Fatalf("expected 1 call, got %d", n)
	}

	time.Sleep(60 * time.Millisecond) // wait for TTL to expire

	_, _ = cache.Validate(input) // call 2 — should miss cache
	if n := atomic.LoadInt32(&calls); n != 2 {
		t.Fatalf("expected 2 calls after TTL expiry, got %d", n)
	}
}

func TestCachingClientLookup(t *testing.T) {
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"valid":true,"api_key":{"id":"k1","prefix":"pk_test"},"backend_service":{"id":"s1","slug":"my-api","base_url":"http://up:3130","allowed_routes":[{"method":"GET","path":"/*"}]}}`))
	}))
	defer srv.Close()

	inner := validation.NewClient(srv.URL)
	cache := validation.NewCachingClient(inner, 1*time.Second, 100*time.Millisecond)
	defer cache.Stop()

	result, err := cache.Lookup(validation.LookupInput{APIKey: "pk.key1"})
	if err != nil || !result.Valid {
		t.Fatal("expected valid lookup result")
	}
	if n := atomic.LoadInt32(&calls); n != 1 {
		t.Fatalf("expected 1 call, got %d", n)
	}

	result, err = cache.Lookup(validation.LookupInput{APIKey: "pk.key1"})
	if err != nil || !result.Valid {
		t.Fatal("expected cached lookup result")
	}
	if n := atomic.LoadInt32(&calls); n != 1 {
		t.Fatalf("expected still 1 call, got %d", n)
	}
}
