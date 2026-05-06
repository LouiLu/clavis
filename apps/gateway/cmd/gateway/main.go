package main

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/redis/go-redis/v9"

	"platform/gateway/internal/config"
	"platform/gateway/internal/logging"
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
	keyProxy := proxy.NewKeyProxy()

	router := chi.NewRouter()

	// Logging must be registered via Use() before any routes.
	var logSender *logging.Client
	if cfg.LoggingEnabled {
		endpoint := strings.TrimRight(cfg.ControlPlaneURL, "/") + "/internal/v1/request-logs/ingest"
		logSender = logging.NewClient(endpoint, cfg.LogChannelSize, cfg.LogBatchSize, cfg.LogFlushInterval)
		defer logSender.Shutdown()
		router.Use(middleware.Logging(logSender))
	}

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

	router.With(
		middleware.QueryAuth(validationClient),
		middleware.RateLimit(redisClient),
	).Handle("/*", keyProxy)

	server := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}
	log.Printf("gateway listening on :%s", cfg.Port)
	log.Fatal(server.ListenAndServe())
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		log.Printf("encode response: %v", err)
	}
}
