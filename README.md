# API Key Platform

An open-source API key management platform with a React admin portal, NestJS control plane, Go gateway, Postgres, and Redis. Create and manage API keys, enforce access control, and apply rate limiting — all from a single `docker compose up`.

## Architecture

```
                    ┌──────────────┐
                    │  Admin Portal │   React + Vite (port 3000)
                    │  (React SPA)  │
                    └──────┬───────┘
                           │ REST API
                           ▼
┌──────────┐     ┌─────────────────┐     ┌──────────┐
│  Redis   │◄────│  Control Plane   │────►│ Postgres │
│ (cache)  │     │  (NestJS/Prisma) │     │  (data)  │
└──────────┘     │   port 4000      │     └──────────┘
    ▲            └────────┬─────────┘
    │                     │ internal API
    │                     ▼
    │            ┌─────────────────┐
    └───────────►│    Gateway       │◄─── external traffic
     rate limit  │    (Go / chi)    │     API keys required
                 │    port 8080     │
                 └────────┬─────────┘
                          │ proxy
                          ▼
                 ┌─────────────────┐
                 │ Backend Services │   Your microservices
                 │ (any port/loc)   │
                 └─────────────────┘
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Admin Portal | React 19, TypeScript, TanStack Router, React Query, Vite |
| Control Plane | NestJS 11, Fastify, Prisma 6, TypeScript |
| Gateway | Go 1.24, chi v5, go-redis v9 |
| Database | PostgreSQL 16 |
| Cache / Rate Limiting | Redis 7 |
| Runtime | Docker Compose |

## Project Structure

```
.
├── apps/
│   ├── admin-portal/            React admin SPA
│   │   └── src/
│   │       ├── auth/            Login, token storage, route guards
│   │       ├── api/             Typed HTTP client
│   │       ├── routes/          Page components (TanStack Router)
│   │       └── components/      Shared UI components
│   ├── control-plane/           NestJS API server
│   │   └── src/
│   │       ├── auth/            Session tokens, login, guards
│   │       ├── me/              Current user context
│   │       ├── organizations/   Org and member management
│   │       ├── services/        Backend service registry
│   │       ├── api-keys/        Key lifecycle (CRUD, rotate, revoke)
│   │       ├── gateway-validation/ Internal endpoint for gateway
│   │       └── audit/           Management audit log
│   ├── gateway/                 Go reverse proxy
│   │   └── internal/
│   │       ├── config/          Environment configuration
│   │       ├── validation/      Control plane HTTP client
│   │       ├── middleware/      Auth, rate limiting, query auth
│   │       └── proxy/           Dynamic reverse proxy handlers
│   └── sample-backend/          Mock backend for testing
├── docs/superpowers/plans/      Implementation plans
├── scripts/smoke-compose.sh     End-to-end test suite
├── docker-compose.yml           Local runtime
└── .env.example                 Environment template
```

## Quick Start

```bash
git clone https://github.com/your-org/api-key-platform.git
cd api-key-platform

# Create your .env from the template
cp .env.example .env

# Edit .env — set your own passwords (all values marked CHANGE_ME)
# vim .env

docker compose up -d --build
./scripts/smoke-compose.sh
```

### Local endpoints

| Service | URL |
|---------|-----|
| Admin Portal | http://localhost:3000 |
| Control Plane | http://localhost:4000/health |
| Gateway | http://localhost:8080/health |
| Sample Backend | http://localhost:6060/health |

### Default credentials

- **Email:** `admin@example.local`
- **Password:** the value you set for `SEED_ADMIN_PASSWORD` in `.env`

## How It Works

### Adding a backend service

1. Log into the admin portal at http://localhost:3000
2. Go to **Services** → **Create Service**
3. Fill in: name, slug, base URL (where your service runs), and allowed routes
4. Go to the service → **Manage Keys** → **Create Key**
5. Copy the generated API key (shown only once)

### Using the API key

**Header-based (Authorization header):**

```bash
curl http://localhost:8080/proxy/{service-slug}/your-endpoint \
  -H "Authorization: Bearer pk_live_xxxxxxxx.yyyyy"
```

The gateway validates the key, checks the route, enforces rate limits, strips the `/proxy/{service-slug}` prefix, and forwards the request to your backend.

**Query-parameter-based (?key=):**

```bash
curl "http://localhost:8080/your-endpoint?key=pk_live_xxxxxxxx.yyyyy"
```

The gateway looks up the key, finds its associated service, and forwards the request path intact to the backend.

### Enforcement

| Scenario | Response |
|----------|----------|
| Missing or invalid key | `401` |
| Key not authorized for the service | `403` |
| Route not allowed by the key's service | `403` |
| Rate limit exceeded | `429` + `Retry-After` header |
| Valid request | `200` (proxied to backend) |

All proxied responses include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers.

### Architecture deep dive

Each proxied request goes through this pipeline:

```
1. Extract API key     →  from Authorization header or ?key= param
2. Extract service      →  from URL path (/proxy/{slug}) or key lookup
3. Validate             →  POST /internal/v1/api-keys/validate (control plane)
4. Authorize route      →  check method + path against allowed_routes
5. Rate limit           →  Redis token bucket with Lua script
6. Proxy                →  forward to backend service base_url
7. Return response      →  with rate-limit headers
```

## Control Plane API

The control plane exposes a REST API at `http://localhost:4000`. All endpoints except `/v1/auth/login` require a Bearer token.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/auth/login` | POST | Authenticate with email/password |
| `/v1/me` | GET | Current user profile and organizations |
| `/v1/organizations` | GET | List organizations |
| `/v1/organizations/:id/members` | GET, POST, PATCH | Manage org members |
| `/v1/services` | GET, POST | List and create backend services |
| `/v1/services/:id` | GET, PATCH, DELETE | Manage a backend service |
| `/v1/services/:id/api-keys` | GET, POST | List and create API keys |
| `/v1/api-keys/:id` | GET | Get API key details |
| `/v1/api-keys/:id/rotate` | POST | Rotate key (returns new plaintext) |
| `/v1/api-keys/:id/revoke` | POST | Revoke a key |
| `/v1/api-keys/:id` | DELETE | Delete a key permanently |
| `/v1/audit-logs` | GET | Latest 100 management actions |
| `/internal/v1/api-keys/validate` | POST | Gateway key validation |
| `/internal/v1/api-keys/lookup` | POST | Gateway key lookup (no slug needed) |

## Contributing

Contributions are welcome. Before submitting a PR:

1. Run `./scripts/smoke-compose.sh` — all checks must pass
2. Run `pnpm test` — all 9 test suites must pass
3. Run `cd apps/gateway && go test -race ./...` — Go tests must pass
4. Follow [conventional commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`

## License

MIT
