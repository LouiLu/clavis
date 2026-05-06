package middleware

import (
	"bufio"
	"net"
	"net/http"
)

type responseWriter struct {
	http.ResponseWriter
	statusCode int
	wroteHdr   bool
}

func (rw *responseWriter) WriteHeader(code int) {
	if rw.wroteHdr {
		return
	}
	rw.statusCode = code
	rw.wroteHdr = true
	rw.ResponseWriter.WriteHeader(code)
}

func (rw *responseWriter) Write(b []byte) (int, error) {
	if !rw.wroteHdr {
		rw.WriteHeader(http.StatusOK)
	}
	return rw.ResponseWriter.Write(b)
}

func (rw *responseWriter) StatusCode() int {
	if !rw.wroteHdr {
		return http.StatusOK
	}
	return rw.statusCode
}

// Hijack supports websocket upgrades through the reverse proxy.
func (rw *responseWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	if hj, ok := rw.ResponseWriter.(http.Hijacker); ok {
		return hj.Hijack()
	}
	return nil, nil, http.ErrNotSupported
}

var _ http.Hijacker = (*responseWriter)(nil)
