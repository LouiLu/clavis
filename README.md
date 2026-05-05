# API Key Platform

Internal-first API key platform with a React admin portal, NestJS control plane, Go gateway, Postgres, Redis, and a sample backend.

## Local Run

```bash
cp .env.example .env
docker compose up -d --build
./scripts/smoke-compose.sh
```

Local endpoints:

- Admin portal: http://localhost:3000
- Control plane health: http://localhost:4000/health
- Gateway health: http://localhost:8080/health
- Gateway sample proxy: http://localhost:8080/proxy/sample/health (requires API key)
- Sample backend health: http://localhost:6060/health

Default seeded admin:

- Email: `admin@example.local`
- Password: value of `SEED_ADMIN_PASSWORD` in `.env`

## Admin Portal

Open http://localhost:3000 and sign in with the seeded admin credentials to:

- View the dashboard with service and member counts.
- Manage backend services (create, edit, disable).
- Create, rotate, revoke, and delete API keys per service.
- View and manage organization members.
- Browse the audit log of all management actions.

## Control Plane Smoke Flow

1. Login with the seeded admin.
2. List backend services.
3. Create an API key for the sample service.
4. Validate the key through the internal validation endpoint.
5. Use the key to proxy through the gateway: `curl -H "Authorization: Bearer <key>" http://localhost:8080/proxy/sample/health`

## Gateway Enforcement

The gateway validates every proxied request:

| Scenario | HTTP Status |
|----------|-------------|
| Missing API key | 401 |
| Invalid/revoked key | 401 |
| Key not authorized for service | 403 |
| Route not allowed | 403 |
| Rate limit exceeded | 429 |
| Valid request | 200 (proxied) |
