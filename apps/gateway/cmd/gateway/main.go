package main

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"

	"platform/gateway/internal/config"
	"platform/gateway/internal/proxy"
)

func main() {
	cfg := config.Load()

	sampleProxy, err := proxy.NewSingleTargetProxy(cfg.SampleBackendURL, "/proxy/sample")
	if err != nil {
		log.Fatalf("create sample proxy: %v", err)
	}

	router := chi.NewRouter()
	router.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{
			"status":  "ok",
			"service": "gateway",
		})
	})
	router.Handle("/proxy/sample/*", sampleProxy)

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
