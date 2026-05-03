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
- Gateway sample proxy: http://localhost:8080/proxy/sample/health
- Sample backend health: http://localhost:6060/health

Default seeded admin:

- Email: `admin@example.local`
- Password: value of `SEED_ADMIN_PASSWORD` in `.env`
