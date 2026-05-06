package middleware

import (
	"context"
	"net/http"

	"platform/gateway/internal/validation"
)

// QueryKeyLookup is a Validator that uses the lookup endpoint (no service_slug needed).
type QueryKeyLookup interface {
	Lookup(input validation.LookupInput) (*validation.ValidationResult, error)
}

// QueryAuth returns middleware that extracts an API key from the ?key= query
// parameter, looks up the associated service via the control plane, and injects
// the validation result into context. Does NOT check service slug (the key
// determines routing) and does NOT check allowed_routes (the entire path is
// forwarded as-is).
func QueryAuth(lookupClient QueryKeyLookup) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			apiKey := r.URL.Query().Get("key")
			if apiKey == "" {
				setRejectionReason(r.Context(), "missing_api_key")
				writeError(w, http.StatusUnauthorized, "missing_api_key",
					"An API key is required. Provide it via the ?key= query parameter.")
				return
			}

			result, err := lookupClient.Lookup(validation.LookupInput{APIKey: apiKey})
			if err != nil {
				setRejectionReason(r.Context(), "gateway_error")
				writeError(w, http.StatusBadGateway, "gateway_error",
					"Unable to validate the API key. Please try again later.")
				return
			}

			if !result.Valid {
				setRejectionReason(r.Context(), result.Reason)
				code, codeStr, msg := mapValidationFailure(result.Reason)
				writeError(w, code, codeStr, msg)
				return
			}

			ctx := context.WithValue(r.Context(), validationResultKey, result)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
