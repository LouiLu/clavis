package proxy

import (
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"

	"platform/gateway/internal/middleware"
)

// NewDynamicProxy creates a reverse proxy handler that reads the upstream
// base URL from the validation result in context and strips the /proxy/{slug} prefix.
func NewDynamicProxy() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		result := middleware.GetValidationResult(r.Context())
		if result == nil || result.BackendService == nil {
			http.Error(w, `{"error":"gateway_error","message":"No validated upstream target"}`, http.StatusBadGateway)
			return
		}

		targetURL, err := url.Parse(result.BackendService.BaseURL)
		if err != nil {
			http.Error(w, `{"error":"gateway_error","message":"Invalid upstream URL"}`, http.StatusBadGateway)
			return
		}

		stripPrefix := "/proxy/" + result.BackendService.Slug

		proxy := httputil.NewSingleHostReverseProxy(targetURL)
		originalDirector := proxy.Director
		proxy.Director = func(req *http.Request) {
			originalDirector(req)
			req.URL.Path = strings.TrimPrefix(req.URL.Path, stripPrefix)
			if req.URL.Path == "" {
				req.URL.Path = "/"
			}
			req.Host = targetURL.Host
			req.Header.Set("X-Platform-Service-Slug", result.BackendService.Slug)
			req.Header.Set("X-Platform-API-Key-ID", result.APIKey.ID)
		}

		proxy.ServeHTTP(w, r)
	})
}
