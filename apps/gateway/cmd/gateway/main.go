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

	redisOpts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		log.Fatalf("invalid REDIS_URL: %v", err)
	}
	redisClient := redis.NewClient(redisOpts)
	defer redisClient.Close()

	dynamicProxy := proxy.NewDynamicProxy()

	router := chi.NewRouter()

	router.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{
			"status":  "ok",
			"service": "gateway",
		})
	})

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
