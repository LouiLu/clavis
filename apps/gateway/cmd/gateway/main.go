package main

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

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

	router.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{
			"status":  "ok",
			"service": "gateway",
		})
	})

	var logSender *logging.Client
	if cfg.LoggingEnabled {
		endpoint := strings.TrimRight(cfg.ControlPlaneURL, "/") + "/internal/v1/request-logs/ingest"
		logSender = logging.NewClient(endpoint, cfg.LogChannelSize, cfg.LogBatchSize, cfg.LogFlushInterval)
		defer logSender.Shutdown()
	}

	logProxyMiddleware := func(next http.Handler) http.Handler { return next }
	keyProxyMiddleware := func(next http.Handler) http.Handler { return next }
	if logSender != nil {
		logProxyMiddleware = middleware.Logging(logSender)
		keyProxyMiddleware = middleware.Logging(logSender)
	}

	router.With(
		middleware.Auth(validationClient),
		middleware.RateLimit(redisClient),
		logProxyMiddleware,
	).Handle("/proxy/*", dynamicProxy)

	router.With(
		middleware.QueryAuth(validationClient),
		middleware.RateLimit(redisClient),
		keyProxyMiddleware,
	).Handle("/*", keyProxy)

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
