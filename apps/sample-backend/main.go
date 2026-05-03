package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
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

	log.Printf("sample backend listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, mux))
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
