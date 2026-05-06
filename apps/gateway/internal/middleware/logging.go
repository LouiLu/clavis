package middleware

import (
	"context"
	"net/http"
	"time"
)

// LogEntry represents a single request log record sent to the control plane.
// Fields that are unknown for rejected requests are left as empty strings.
type LogEntry struct {
	APIKeyID        string `json:"api_key_id"`
	OrganizationID  string `json:"organization_id"`
	ServiceID       string `json:"service_id"`
	ServiceSlug     string `json:"service_slug"`
	Method          string `json:"method"`
	Path            string `json:"path"`
	StatusCode      int    `json:"status_code"`
	LatencyMs       int64  `json:"latency_ms"`
	Timestamp       string `json:"timestamp"`
	RejectionReason string `json:"rejection_reason,omitempty"`
}

// LogSender sends a batch of log entries to the control plane.
type LogSender interface {
	Send(entries []LogEntry)
}

// requestMeta carries per-request metadata that inner middlewares (auth,
// rate-limit) may populate before returning. It is passed via context as a
// pointer so mutations are visible to the outermost logging middleware.
type requestMeta struct {
	RejectionReason string
}

type requestMetaKeyType string

const requestMetaCtxKey requestMetaKeyType = "request_meta"

// setRejectionReason stores a rejection reason on the request's metadata so the
// logging middleware can record it even when the handler chain is short-circuited.
func setRejectionReason(ctx context.Context, reason string) {
	if meta, ok := ctx.Value(requestMetaCtxKey).(*requestMeta); ok {
		meta.RejectionReason = reason
	}
}

// Logging returns middleware that records every request — including rejected
// ones — and sends metadata to the control plane via sender. It must be
// installed as the outermost middleware (router.Use) so it wraps auth,
// rate-limit, and proxy; the responseWriter captures the status code
// regardless of which layer wrote the response.
func Logging(sender LogSender) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			rw := &responseWriter{ResponseWriter: w}
			start := time.Now()

			meta := &requestMeta{}
			ctx := context.WithValue(r.Context(), requestMetaCtxKey, meta)
			r = r.WithContext(ctx)

			next.ServeHTTP(rw, r)

			result := GetValidationResult(r.Context())

			entry := LogEntry{
				Method:          r.Method,
				Path:            r.URL.Path,
				StatusCode:      rw.StatusCode(),
				LatencyMs:       time.Since(start).Milliseconds(),
				Timestamp:       start.UTC().Format(time.RFC3339),
				RejectionReason: meta.RejectionReason,
			}

			if result != nil && result.APIKey != nil {
				entry.APIKeyID = result.APIKey.ID
			}
			if result != nil && result.Organization != nil {
				entry.OrganizationID = result.Organization.ID
			}
			if result != nil && result.BackendService != nil {
				entry.ServiceID = result.BackendService.ID
				entry.ServiceSlug = result.BackendService.Slug
			}

			sender.Send([]LogEntry{entry})
		})
	}
}
