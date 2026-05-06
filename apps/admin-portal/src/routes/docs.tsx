import { useEffect, useRef, useState } from 'react';
import { createRoute } from '@tanstack/react-router';
import { authRoute } from './_auth';

const SECTIONS = [
  { id: 'what-is-clavis', label: 'What is Clavis?' },
  { id: 'architecture', label: 'Architecture' },
  { id: 'onboarding', label: 'Onboarding a New Service' },
  { id: 'rate-limiting', label: 'Rate Limiting' },
  { id: 'monitoring', label: 'Monitoring & Metrics' },
  { id: 'performance', label: 'Performance & Capacity' },
];

function DocsNav({ activeId }: { activeId: string }) {
  return (
    <nav className="docs-nav">
      <h4 className="docs-nav-title">On this page</h4>
      <ul className="docs-nav-list">
        {SECTIONS.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className={`docs-nav-link${activeId === s.id ? ' docs-nav-link-active' : ''}`}
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function DocsPage() {
  const [activeId, setActiveId] = useState(SECTIONS[0].id);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: '-80px 0px -70% 0px' },
    );

    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) observerRef.current.observe(el);
    }

    return () => observerRef.current?.disconnect();
  }, []);

  return (
    <div className="docs-layout">
      <div className="docs">
        <div className="page-header">
          <h1>Documentation</h1>
        </div>

        <section className="docs-section" id="what-is-clavis">
          <h2>What is Clavis?</h2>
          <p>
            Clavis is an API management platform. It sits between your backend services and
            the clients that consume them, providing authentication, rate limiting, routing,
            and observability — without requiring any SDK or framework changes in your services.
          </p>
        </section>

        <section className="docs-section" id="architecture">
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

        <section className="docs-section" id="onboarding">
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

        <section className="docs-section" id="rate-limiting">
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

        <section className="docs-section" id="monitoring">
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

        <section className="docs-section" id="performance">
          <h2>Performance & Capacity</h2>
          <p>
            Every API request passes through the gateway's middleware chain before reaching
            your backend. Understanding where time is spent helps you reason about latency
            and plan capacity.
          </p>

          <h3>Request Path Latency</h3>
          <div className="docs-table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Step</th><th>Component</th><th>Latency</th><th>Notes</th></tr>
              </thead>
              <tbody>
                <tr><td>1</td><td>Gateway HTTP + proxy</td><td>&lt;1ms</td><td>Go stdlib reverse proxy</td></tr>
                <tr><td>2</td><td>HTTP to control plane</td><td>1–2ms</td><td>Docker internal network</td></tr>
                <tr><td>3</td><td>PostgreSQL key lookup</td><td>1–3ms</td><td>Indexed on key prefix</td></tr>
                <tr><td>4</td><td><strong>API key verification</strong></td><td><strong>&lt;0.1ms</strong></td><td>SHA-256 HMAC with constant-time comparison</td></tr>
                <tr><td>5</td><td>Redis rate limit (Lua)</td><td>1–2ms</td><td>Token bucket script</td></tr>
                <tr className="docs-table-divider"><td colSpan={4}></td></tr>
                <tr><td colSpan={2}><strong>Total gateway overhead</strong></td><td><strong>5–15ms</strong></td><td>Per request, excluding backend processing</td></tr>
              </tbody>
            </table>
          </div>

          <h3>Throughput Capacity</h3>
          <p>
            Estimated sustainable throughput for a single control-plane instance
            (the bottleneck component). All other components (gateway Go process,
            Redis, PostgreSQL) scale well beyond these numbers.
          </p>
          <div className="docs-table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Monthly Volume</th><th>Avg req/s</th><th>Peak req/s (10x)</th><th>Status</th></tr>
              </thead>
              <tbody>
                <tr><td>2M</td><td>0.8</td><td>8</td><td><span className="badge badge-active">idle</span></td></tr>
                <tr><td>20M</td><td>8</td><td>80</td><td><span className="badge badge-active">comfortable</span></td></tr>
                <tr><td>100M</td><td>39</td><td>390</td><td><span className="badge badge-active">comfortable</span></td></tr>
                <tr><td>500M</td><td>193</td><td>1,930</td><td>Add instances</td></tr>
                <tr><td>1B+</td><td>386+</td><td>3,860+</td><td>Add instances + cache</td></tr>
              </tbody>
            </table>
          </div>

          <h3>Key Verification: argon2 → SHA-256</h3>
          <p>
            The original implementation used <code>argon2</code> for API key verification —
            a password hashing algorithm that is deliberately slow (50–100ms per call)
            to resist brute-force attacks on low-entropy human passwords.
          </p>
          <p>
            Clavis API keys are 256-bit CSPRNG values (~43 characters of base64url-encoded
            randomness). At 1 trillion guesses per second, brute-forcing a single key would
            take longer than the age of the universe. The hash speed is irrelevant to security.
          </p>
          <div className="docs-table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Algorithm</th><th>Verification time</th><th>Single-instance throughput</th><th>Use case</th></tr>
              </thead>
              <tbody>
                <tr><td>argon2id</td><td>50–100ms</td><td>~50 req/s</td><td>User passwords (still used)</td></tr>
                <tr><td>SHA-256</td><td>&lt;0.1ms</td><td>~200+ req/s</td><td>API keys (current)</td></tr>
              </tbody>
            </table>
          </div>
          <p>
            Measured end-to-end: SHA-256 key verification completes in <strong>12ms</strong> vs
            <strong>40ms</strong> for argon2 — a 3.3x improvement on the critical path.
          </p>

          <h3>Scaling Recommendations</h3>
          <ul>
            <li><strong>Up to 100M calls/month:</strong> a single control-plane instance is sufficient</li>
            <li><strong>100M–500M calls/month:</strong> run 2–3 control-plane replicas behind a load balancer; the gateway already supports <code>CONTROL_PLANE_URL</code> pointing to a load balancer</li>
            <li><strong>500M+ calls/month:</strong> add an in-memory validation cache to the gateway (30s TTL per API key) to reduce control-plane calls by 90%+</li>
            <li><strong>Gateway:</strong> a single Go process handles 10,000+ concurrent connections — not a bottleneck at any realistic volume</li>
            <li><strong>Redis:</strong> 100,000+ ops/sec — not a bottleneck</li>
            <li><strong>PostgreSQL:</strong> use connection pooling (PgBouncer) and read replicas for metrics queries at high volume</li>
          </ul>

          <div className="docs-callout">
            <strong>Key takeaway</strong>
            <p>
              The gateway adds 5–15ms of overhead per request. The dominant variable is your
              backend's response time. Clavis itself scales to hundreds of millions of calls
              per month on modest hardware before needing horizontal scaling.
            </p>
          </div>
        </section>
      </div>

      <aside className="docs-sidebar">
        <DocsNav activeId={activeId} />
      </aside>
    </div>
  );
}

export const docsRoute = createRoute({
  getParentRoute: () => authRoute,
  path: '/docs',
  component: DocsPage,
});
