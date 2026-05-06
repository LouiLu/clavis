package middleware

import (
	"net/http"
	"time"
)

// LogEntry represents a single request log record sent to the control plane.
type LogEntry struct {
	APIKeyID       string `json:"api_key_id"`
	OrganizationID string `json:"organization_id"`
	ServiceID      string `json:"service_id"`
	ServiceSlug    string `json:"service_slug"`
	Method         string `json:"method"`
	Path           string `json:"path"`
	StatusCode     int    `json:"status_code"`
	LatencyMs      int64  `json:"latency_ms"`
	Timestamp      string `json:"timestamp"`
}

// LogSender sends a batch of log entries to the control plane.
type LogSender interface {
	Send(entries []LogEntry)
}

// Logging returns middleware that records request metadata after the
// downstream handler completes and sends it to the control plane via sender.
func Logging(sender LogSender) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			result := GetValidationResult(r.Context())
			if result == nil || result.APIKey == nil || result.BackendService == nil {
				next.ServeHTTP(w, r)
				return
			}

			rw := &responseWriter{ResponseWriter: w}
			start := time.Now()

			next.ServeHTTP(rw, r)

			sender.Send([]LogEntry{{
				APIKeyID:       result.APIKey.ID,
				OrganizationID: result.Organization.ID,
				ServiceID:      result.BackendService.ID,
				ServiceSlug:    result.BackendService.Slug,
				Method:         r.Method,
				Path:           r.URL.Path,
				StatusCode:     rw.StatusCode(),
				LatencyMs:      time.Since(start).Milliseconds(),
				Timestamp:      start.UTC().Format(time.RFC3339),
			}})
		})
	}
}
