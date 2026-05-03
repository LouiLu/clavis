#!/usr/bin/env bash
set -euo pipefail

curl_json() {
  local url="$1"
  curl --fail --silent --show-error "$url"
}

echo "Checking admin portal..."
curl --fail --silent --show-error http://localhost:3000 >/dev/null

echo "Checking control plane..."
curl_json http://localhost:4000/health | grep '"status":"ok"'

echo "Checking gateway..."
curl_json http://localhost:8080/health | grep '"service":"gateway"'

echo "Checking sample backend..."
curl_json http://localhost:6060/health | grep '"service":"sample-backend"'

echo "Checking gateway proxy to sample backend..."
curl_json http://localhost:8080/proxy/sample/health | grep '"service":"sample-backend"'

echo "Checking database seed..."
docker compose exec -T postgres psql -U "${POSTGRES_USER:-platform}" -d "${POSTGRES_DB:-platform}" -c "select email from users where email = '${SEED_ADMIN_EMAIL:-admin@example.local}';" | grep "${SEED_ADMIN_EMAIL:-admin@example.local}"
docker compose exec -T postgres psql -U "${POSTGRES_USER:-platform}" -d "${POSTGRES_DB:-platform}" -c "select slug from backend_services where slug = '${SEED_SERVICE_SLUG:-sample}';" | grep "${SEED_SERVICE_SLUG:-sample}"

echo "Checking Redis..."
docker compose exec -T redis redis-cli ping | grep PONG

echo "Smoke checks passed."
