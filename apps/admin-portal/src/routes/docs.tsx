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
  { id: 'deployment', label: 'Deployment & Scaling' },
  { id: 'server-specs', label: 'Server Requirements' },
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

        <section className="docs-section" id="deployment">
          <h2>Deployment & Scaling</h2>
          <p>
            Clavis is designed to scale from a single Docker Compose host to a multi-replica
            Kubernetes cluster with no code changes — all configuration is environment-variable
            driven and all services are stateless.
          </p>

          <h3>Deployment Tiers</h3>
          <div className="docs-table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Tier</th><th>Infrastructure</th><th>Capacity</th><th>When to use</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Tier 1</strong></td>
                  <td>Docker Compose</td>
                  <td>Up to 100M calls/month</td>
                  <td>Development, staging, low-traffic production</td>
                </tr>
                <tr>
                  <td><strong>Tier 2</strong></td>
                  <td>Compose + managed DB/Redis</td>
                  <td>100M–500M calls/month</td>
                  <td>Production with minimal ops burden</td>
                </tr>
                <tr>
                  <td><strong>Tier 3</strong></td>
                  <td>Kubernetes + managed services</td>
                  <td>500M+ calls/month</td>
                  <td>High scale, multi-team, multi-region</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3>Tier 1: Docker Compose</h3>
          <p>
            The current <code>docker-compose.yml</code> runs all services on a single host.
            Suitable for development and moderate production loads. The gateway and control
            plane are the only externally-facing services.
          </p>
          <div className="docs-code">
            <pre>{`# Scale up with more control-plane instances
docker compose up -d --scale control-plane=3`}</pre>
          </div>

          <h3>Tier 2: Compose + Managed Services</h3>
          <p>
            Swap in managed infrastructure for stateful components while keeping
            application services on Compose:
          </p>
          <ul>
            <li><strong>PostgreSQL → AWS RDS / GCP Cloud SQL:</strong> set <code>DATABASE_URL</code> to the managed instance</li>
            <li><strong>Redis → AWS ElastiCache / GCP Memorystore:</strong> set <code>REDIS_URL</code> to the managed instance</li>
            <li><strong>Admin Portal → S3 + CloudFront:</strong> build the Vite output and upload to a CDN-backed bucket</li>
            <li><strong>Gateway + Control Plane:</strong> run on VMs with autoscaling groups, pointing at the managed DB/Redis</li>
          </ul>
          <p>
            This gives you managed backups, snapshots, and high availability for stateful
            components without the complexity of Kubernetes.
          </p>

          <h3>Tier 3: Kubernetes</h3>
          <p>
            All Clavis services map cleanly to Kubernetes primitives. The repository
            includes a full set of manifests in <code>deploy/k8s/</code>:
          </p>
          <div className="docs-code">
            <pre>{`deploy/k8s/
├── namespace.yaml          # clavis namespace
├── configmap.yaml          # Non-sensitive configuration
├── secret.yaml             # DATABASE_URL, REDIS_URL, credentials
├── control-plane.yaml      # Deployment (2 replicas) + Service
├── gateway.yaml            # Deployment (3 replicas) + Service
├── admin-portal.yaml       # Deployment (2 replicas) + Service
├── migrate-seed.yaml       # One-shot Job (Prisma migrate + seed)
├── hpa.yaml                # HorizontalPodAutoscaler (CPU 70%)
├── ingress.yaml            # TLS + routing (api. / admin. hosts)
└── kustomization.yaml      # Ties it all together`}</pre>
          </div>

          <h4>Architecture on Kubernetes</h4>
          <div className="docs-diagram">
            <pre>{`                   ┌──────────────────┐
                   │   Cloud LB / Nginx │
                   │     Ingress        │
                   └───┬────────────┬───┘
                       │            │
              ┌────────▼──┐  ┌─────▼──────────┐
              │  Gateway  │  │  Admin Portal  │
              │  3-20 pod │  │    2 pods      │
              │  (HPA)    │  │   (nginx)      │
              └─────┬─────┘  └────────────────┘
                    │
              ┌─────▼──────────┐
              │ Control Plane  │
              │   2-10 pods    │
              │    (HPA)       │
              └──┬─────────┬───┘
                 │         │
        ┌────────▼──┐ ┌───▼──────────┐
        │   Redis   │ │ PostgreSQL   │
        │ (managed) │ │  (managed)   │
        └───────────┘ └──────────────┘`}</pre>
          </div>

          <h4>Deploying</h4>
          <div className="docs-code">
            <pre>{`# Build and push images
docker build -t clavis/gateway:latest -f apps/gateway/Dockerfile .
docker build -t clavis/control-plane:latest -f apps/control-plane/Dockerfile .
docker build -t clavis/admin-portal:latest -f apps/admin-portal/Dockerfile .

# Run migrations first
kubectl apply -f deploy/k8s/migrate-seed.yaml
kubectl wait --for=condition=complete job/migrate-seed -n clavis

# Deploy everything
kubectl apply -k deploy/k8s/

# Verify
kubectl get pods -n clavis
kubectl get ingress -n clavis`}</pre>
          </div>

          <h4>Key Kubernetes Details</h4>
          <ul>
            <li><strong>Gateway → Control Plane:</strong> uses the internal Service DNS name <code>http://control-plane.clavis.svc.cluster.local:4000</code></li>
            <li><strong>Autoscaling:</strong> HPA scales gateway (3–20) and control-plane (2–10) based on CPU at 70% target</li>
            <li><strong>Secrets:</strong> <code>DATABASE_URL</code>, <code>REDIS_URL</code>, and <code>SEED_ADMIN_PASSWORD</code> pulled from the <code>clavis-secrets</code> Secret</li>
            <li><strong>Health probes:</strong> both services expose <code>/health</code> — used for liveness and readiness checks</li>
            <li><strong>TLS:</strong> ingress terminates TLS via cert-manager (Let's Encrypt), routing <code>api.example.com</code> to the gateway and <code>admin.example.com</code> to the admin portal</li>
            <li><strong>Migrations:</strong> run as a one-shot Job before each deploy — idempotent <code>prisma migrate deploy</code></li>
          </ul>

          <h3>What Doesn't Need to Change</h3>
          <p>
            The codebase is already 12-factor compliant. No code changes are needed to move
            between tiers:
          </p>
          <ul>
            <li>All configuration comes from environment variables</li>
            <li>All services are stateless (no local disk, no sticky sessions)</li>
            <li>Gateway already supports graceful shutdown via <code>Shutdown()</code></li>
            <li>Health endpoints exist on both gateway (<code>:8080/health</code>) and control plane (<code>:4000/health</code>)</li>
            <li>Admin portal is static files — serve with any web server or CDN</li>
          </ul>

          <div className="docs-callout">
            <strong>Recommendation</strong>
            <p>
              Start with Tier 2 (Compose + managed DB/Redis). It gives you 90% of the
              reliability benefit with 10% of the operational complexity. Move to Kubernetes
              when you need pod-level autoscaling, canary deploys, or multi-region.
            </p>
          </div>
        </section>

        <section className="docs-section" id="server-specs">
          <h2>Server Requirements</h2>
          <p>
            Estimated specs for running all Clavis services. Adjust based on your
            expected volume (see <a href="#performance">Performance & Capacity</a> for
            per-tier throughput estimates).
          </p>

          <h3>Development / Staging</h3>
          <p>All services on a single machine via Docker Compose.</p>
          <div className="docs-table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Resource</th><th>Minimum</th><th>Recommended</th></tr>
              </thead>
              <tbody>
                <tr><td>CPU</td><td>2 cores</td><td>4 cores</td></tr>
                <tr><td>RAM</td><td>4 GB</td><td>8 GB</td></tr>
                <tr><td>Disk</td><td>10 GB</td><td>20 GB SSD</td></tr>
                <tr><td>OS</td><td colSpan={2}>Linux (amd64) — Ubuntu 22.04+, Debian 12+, or Amazon Linux 2023</td></tr>
              </tbody>
            </table>
          </div>
          <p>
            8 GB RAM comfortably runs all six containers (PostgreSQL, Redis, control
            plane, gateway, admin portal, sample backend) with room for PostgreSQL
            buffer cache and metrics data growth.
          </p>

          <h3>Production — Single Server</h3>
          <p>Tier 1: Docker Compose on one machine. Suitable up to ~100M calls/month.</p>
          <div className="docs-table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Resource</th><th>Spec</th><th>Notes</th></tr>
              </thead>
              <tbody>
                <tr><td>CPU</td><td>4–8 vCPUs</td><td>Gateway and control plane are the primary consumers</td></tr>
                <tr><td>RAM</td><td>16 GB</td><td>8 GB for PostgreSQL buffer cache, 4 GB for Node.js, 4 GB headroom</td></tr>
                <tr><td>Disk</td><td>50 GB SSD</td><td>Provisioned IOPS recommended for metrics write throughput</td></tr>
                <tr><td>Network</td><td>1 Gbps</td><td>Internal Docker network; external ingress depends on LB</td></tr>
                <tr><td>OS</td><td colSpan={2}>Linux (amd64), Docker Engine 24+, Docker Compose v2</td></tr>
              </tbody>
            </table>
          </div>

          <h3>Production — Managed Services</h3>
          <p>Tier 2: Application on VM, PostgreSQL and Redis managed.</p>
          <div className="docs-table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Component</th><th>Spec</th><th>Example (AWS)</th></tr>
              </thead>
              <tbody>
                <tr><td><strong>App VM</strong> (gateway + control plane)</td><td>2–4 vCPU, 8 GB RAM</td><td>t4g.large or c6g.large</td></tr>
                <tr><td><strong>PostgreSQL</strong></td><td>2 vCPU, 4 GB, 50 GB SSD</td><td>RDS db.t4g.medium</td></tr>
                <tr><td><strong>Redis</strong></td><td>2 vCPU, 1 GB</td><td>ElastiCache cache.t4g.micro</td></tr>
                <tr><td><strong>Admin Portal</strong></td><td>Static hosting</td><td>S3 + CloudFront (512 MB)</td></tr>
              </tbody>
            </table>
          </div>
          <p>
            Scale the App VM horizontally behind a load balancer as volume grows.
            The gateway already supports <code>CONTROL_PLANE_URL</code> pointing at
            a load balancer endpoint.
          </p>

          <h3>Production — Kubernetes</h3>
          <p>Tier 3: All application services on k8s with managed data stores.</p>
          <div className="docs-table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Service</th><th>Replicas</th><th>CPU req/limit</th><th>Memory req/limit</th></tr>
              </thead>
              <tbody>
                <tr><td><strong>Gateway</strong></td><td>3–20 (HPA)</td><td>100m / 500m</td><td>64 Mi / 256 Mi</td></tr>
                <tr><td><strong>Control Plane</strong></td><td>2–10 (HPA)</td><td>250m / 1000m</td><td>256 Mi / 512 Mi</td></tr>
                <tr><td><strong>Admin Portal</strong></td><td>2</td><td>50m / 200m</td><td>32 Mi / 128 Mi</td></tr>
                <tr className="docs-table-divider"><td colSpan={5}></td></tr>
                <tr><td colSpan={2}><strong>Total baseline</strong></td><td><strong>1150m CPU</strong></td><td><strong>~1 GB RAM</strong></td></tr>
              </tbody>
            </table>
          </div>
          <p>
            Baseline cluster needs ~2 vCPUs and 2 GB allocatable memory for the
            application pods. With 3× headroom for spikes: <strong>8 vCPUs, 8 GB
            across the node pool</strong>. Managed PostgreSQL and Redis are provisioned
            separately (same specs as Tier 2).
          </p>

          <h3>Component Memory Breakdown</h3>
          <div className="docs-table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Component</th><th>Memory</th><th>Why</th></tr>
              </thead>
              <tbody>
                <tr><td>PostgreSQL</td><td>8 GB recommended</td><td>Buffer cache for metrics queries; shared_buffers = 2 GB, work_mem = 64 MB</td></tr>
                <tr><td>Redis</td><td>512 MB–1 GB</td><td>Rate limit counters are tiny; extra for optional caching</td></tr>
                <tr><td>Control Plane (Node.js)</td><td>256–512 MB per instance</td><td>NestJS + Prisma; heap grows with concurrent requests</td></tr>
                <tr><td>Gateway (Go)</td><td>64–256 MB per instance</td><td>Validation cache (map), log buffer channel (10K entries)</td></tr>
                <tr><td>Admin Portal (nginx)</td><td>32–128 MB</td><td>Static file serving; negligible</td></tr>
              </tbody>
            </table>
          </div>

          <div className="docs-callout">
            <strong>Cloud instance guidance</strong>
            <p>
              For Tier 1 (single server): an <strong>AWS c6g.xlarge</strong> (4 vCPU,
              8 GB) or <strong>GCP c4a-standard-4</strong> handles ~100M calls/month
              comfortably. For Tier 2 (managed data), drop to a <strong>t4g.large</strong>
              and add RDS + ElastiCache.
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
