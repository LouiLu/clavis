package proxy

import (
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
)

func NewSingleTargetProxy(target string, stripPrefix string) (http.Handler, error) {
	targetURL, err := url.Parse(target)
	if err != nil {
		return nil, err
	}

	proxy := httputil.NewSingleHostReverseProxy(targetURL)
	originalDirector := proxy.Director

	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		req.URL.Path = strings.TrimPrefix(req.URL.Path, stripPrefix)
		if req.URL.Path == "" {
			req.URL.Path = "/"
		}
		req.Host = targetURL.Host
		req.Header.Set("X-Platform-Service-Slug", "sample")
	}

	return proxy, nil
}
