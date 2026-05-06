package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"
)

func main() {
	port := getenv("SAMPLE_BACKEND_PORT", "6060")

	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{
			"status":  "ok",
			"service": "sample-backend",
		})
	})
	mux.HandleFunc("/v1/jobs", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"items": []map[string]string{
				{"id": "job_001", "status": "queued"},
			},
		})
	})
	mux.HandleFunc("GET /routing/matrix/{version}", func(w http.ResponseWriter, r *http.Request) {
		version := r.PathValue("version")
		writeJSON(w, http.StatusOK, map[string]any{
			"service":  "sample-backend",
			"endpoint": "routing matrix",
			"version":  version,
			"routes": []map[string]any{
				{"id": "route_001", "origin": "A", "destination": "B", "distance_km": 142.5, "duration_min": 95},
				{"id": "route_002", "origin": "A", "destination": "B", "distance_km": 158.3, "duration_min": 110},
				{"id": "route_003", "origin": "A", "destination": "B", "distance_km": 130.7, "duration_min": 88},
			},
		})
	})

	server := &http.Server{
		Addr:         ":" + port,
		Handler:      mux,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}
	log.Printf("sample backend listening on :%s", port)
	log.Fatal(server.ListenAndServe())
}

func getenv(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		log.Printf("encode response: %v", err)
	}
}
