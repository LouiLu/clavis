import { createRoute } from '@tanstack/react-router';
import { authRoute } from './_auth';

function DocsPage() {
  return (
    <div className="docs">
      <div className="page-header">
        <h1>Documentation</h1>
      </div>

      <section className="docs-section">
        <h2>What is Clavis?</h2>
        <p>
          Clavis is an API management platform. It sits between your backend services and
          the clients that consume them, providing authentication, rate limiting, routing,
          and observability — without requiring any SDK or framework changes in your services.
        </p>
      </section>

      <section className="docs-section">
        <h2>Architecture</h2>
        <div className="docs-diagram">
          <pre>{`Client (app, web, CLI)
    │
    ▼
┌─────────────────────────────────────┐
│            Gateway (:8080)           │
│  • Auth (API key validation)        │
│  • Rate limiting                    │
│  • Request logging                  │
│  • Proxy to backend                 │
└─────────────────────────────────────┘
    │                    │
    ▼                    ▼
┌──────────┐    ┌───────────────┐
│  Redis   │    │ Control Plane │
│ (counters)│    │   (:4000)     │
└──────────┘    │ • Service reg │
                │ • Key mgmt    │
                │ • Metrics     │
                └───────────────┘
                       │
                       ▼
                ┌──────────────┐
                │  PostgreSQL  │
                └──────────────┘

┌──────────────────────────────────────┐
│         Your Backend Service         │
│  (any language, any framework)       │
│  Just a normal HTTP server           │
└──────────────────────────────────────┘`}</pre>
        </div>
        <p>
          The gateway validates every request against the control plane at runtime.
          This means you can register new services without restarting the gateway.
          Services are reachable by their Docker Compose service name on the internal
          Docker network (e.g. <code>http://my-api:7070</code>).
        </p>
      </section>

      <section className="docs-section">
        <h2>Onboarding a New Service</h2>

        <h3>1. Build Your Service</h3>
        <p>
          Your service is a standard HTTP server. No SDK, no special library.
          The only requirement is a <code>/health</code> endpoint that returns
          a 200 status code for Docker health checks.
        </p>
        <div className="docs-code">
          <pre>{`// Minimal example in Go (any language works)
package main

import (
    "encoding/json"
    "log"
    "net/http"
)

func main() {
    mux := http.NewServeMux()
    mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
    })
    mux.HandleFunc("/v1/orders", func(w http.ResponseWriter, r *http.Request) {
        // Your business logic here
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
            "items": []map[string]string{
                {"id": "ord_001", "status": "confirmed"},
            },
        })
    })
    log.Fatal(http.ListenAndServe(":7070", mux))
}`}</pre>
        </div>

        <h3>2. Create a Dockerfile</h3>
        <div className="docs-code">
          <pre>{`FROM golang:1.23-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o /out/my-api .

FROM alpine:3.21
WORKDIR /app
COPY --from=build /out/my-api .
EXPOSE 7070
HEALTHCHECK --interval=10s --timeout=5s --retries=3 \\
  CMD wget -qO- http://localhost:7070/health
CMD ["/app/my-api"]`}</pre>
        </div>

        <h3>3. Add to Docker Compose</h3>
        <div className="docs-code">
          <pre>{`# In docker-compose.yml
services:
  my-api:
    build:
      context: .
      dockerfile: apps/my-api/Dockerfile
    # Optional: expose port for direct access during development
    ports:
      - "7070:7070"
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:7070/health"]
      interval: 10s
      timeout: 5s
      retries: 20`}</pre>
        </div>

        <h3>4. Register in Clavis</h3>
        <p>
          Go to <strong>Services → Create Service</strong> in the admin portal and fill in:
        </p>
        <table className="data-table">
          <thead>
            <tr>
              <th>Field</th>
              <th>Example</th>
              <th>Purpose</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Name</strong></td>
              <td>My API</td>
              <td>Human-readable display name</td>
            </tr>
            <tr>
              <td><strong>Slug</strong></td>
              <td><code>my-api</code></td>
              <td>URL segment, must be unique. Used in proxy path: <code>/proxy/my-api/...</code></td>
            </tr>
            <tr>
              <td><strong>Base URL</strong></td>
              <td><code>http://my-api:7070</code></td>
              <td>Internal Docker network address. Gateway forwards requests here</td>
            </tr>
            <tr>
              <td><strong>Allowed Routes</strong></td>
              <td><code>GET /*</code>, <code>POST /*</code></td>
              <td>Which HTTP methods and path patterns are permitted through the gateway</td>
            </tr>
          </tbody>
        </table>

        <h3>5. Create API Keys</h3>
        <p>
          Go to the service detail page → <strong>Keys</strong> tab → <strong>Create Key</strong>.
          Give it a descriptive name (e.g. "Mobile App", "Partner Webhooks").
          The key is shown once — copy it immediately.
        </p>

        <h3>6. Clients Call Through the Gateway</h3>
        <p>Clavis supports two access patterns:</p>

        <h4>Bearer Token (recommended for server-to-server)</h4>
        <div className="docs-code">
          <pre>{`curl http://localhost:8080/proxy/my-api/v1/orders \\
  -H "Authorization: Bearer <api-key>"`}</pre>
        </div>
        <p>
          The gateway strips the <code>/proxy/my-api</code> prefix.
          Your backend at <code>http://my-api:7070</code> receives <code>GET /v1/orders</code>.
        </p>

        <h4>Query Parameter (convenient for GET requests, browsers)</h4>
        <div className="docs-code">
          <pre>{`curl "http://localhost:8080/v1/orders?key=<api-key>"`}</pre>
        </div>
        <p>
          The path is forwarded intact. Your backend receives <code>GET /v1/orders</code>.
        </p>

        <div className="docs-callout">
          <strong>Gateway-Injected Headers</strong>
          <p>
            Both modes inject these headers that your backend can optionally use:
          </p>
          <table className="data-table">
            <thead>
              <tr><th>Header</th><th>Value</th></tr>
            </thead>
            <tbody>
              <tr><td><code>X-Platform-Service-Slug</code></td><td><code>my-api</code></td></tr>
              <tr><td><code>X-Platform-API-Key-ID</code></td><td><code>key_abc123...</code></td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="docs-section">
        <h2>Rate Limiting</h2>
        <p>
          Each service can have a rate limit policy. Policies define:
        </p>
        <ul>
          <li><strong>Requests per interval</strong> — how many requests are allowed in the window</li>
          <li><strong>Interval</strong> — the time window in seconds</li>
          <li><strong>Burst size</strong> — how many requests can exceed the rate in a single burst</li>
        </ul>
        <p>
          When a client exceeds the limit, the gateway returns <code>429 Too Many Requests</code>.
          Rate limits are configured per-service through the admin portal and enforced by Redis
          counters in the gateway.
        </p>
      </section>

      <section className="docs-section">
        <h2>Monitoring & Metrics</h2>
        <p>
          Once traffic flows, the <strong>Dashboard</strong> shows:
        </p>
        <ul>
          <li>24-hour request volume and active API keys</li>
          <li>Per-service bar charts with request counts and average latency</li>
          <li>Hover on any bar to see per-API-key breakdown</li>
          <li>Audit logs track all administrative actions (create/disable/rotate keys, etc.)</li>
        </ul>
      </section>
    </div>
  );
}

export const docsRoute = createRoute({
  getParentRoute: () => authRoute,
  path: '/docs',
  component: DocsPage,
});
