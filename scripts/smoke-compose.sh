#!/usr/bin/env bash
set -euo pipefail

curl_json() {
  local url="$1"
  curl --fail --silent --show-error "$url"
}

json_field() {
  local expression="$1"
  node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const json=JSON.parse(d);const value=(${expression})(json);if(value===undefined||value===null){process.exit(1)};console.log(value)})"
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

echo "Logging in to control plane..."
TOKEN="$(
  curl --fail --silent --show-error -X POST http://localhost:4000/v1/auth/login \
    -H 'content-type: application/json' \
    -d "{\"email\":\"${SEED_ADMIN_EMAIL:-admin@example.local}\",\"password\":\"${SEED_ADMIN_PASSWORD:-ChangeMe123!}\"}" |
    json_field 'json => json.access_token'
)"

echo "Checking current user..."
curl --fail --silent --show-error http://localhost:4000/v1/me \
  -H "authorization: Bearer ${TOKEN}" |
  grep "\"email\":\"${SEED_ADMIN_EMAIL:-admin@example.local}\""

echo "Checking service registry..."
SERVICES_JSON="$(
  curl --fail --silent --show-error http://localhost:4000/v1/services \
    -H "authorization: Bearer ${TOKEN}"
)"
echo "${SERVICES_JSON}" | grep "\"slug\":\"${SEED_SERVICE_SLUG:-sample}\""
SERVICE_ID="$(echo "${SERVICES_JSON}" | json_field "json => json.items.find((item) => item.slug === '${SEED_SERVICE_SLUG:-sample}').id")"

echo "Creating API key..."
API_KEY_JSON="$(
  curl --fail --silent --show-error -X POST "http://localhost:4000/v1/services/${SERVICE_ID}/api-keys" \
    -H "authorization: Bearer ${TOKEN}" \
    -H 'content-type: application/json' \
    -d '{"name":"Local smoke key"}'
)"
API_KEY="$(echo "${API_KEY_JSON}" | json_field 'json => json.api_key')"
echo "${API_KEY_JSON}" | grep '"api_key":"pk_live_'

echo "Validating API key..."
curl --fail --silent --show-error -X POST http://localhost:4000/internal/v1/api-keys/validate \
  -H 'content-type: application/json' \
  -d "{\"api_key\":\"${API_KEY}\",\"service_slug\":\"${SEED_SERVICE_SLUG:-sample}\",\"method\":\"GET\",\"path\":\"/health\"}" |
  grep '"valid":true'

echo "Checking audit logs..."
curl --fail --silent --show-error http://localhost:4000/v1/audit-logs \
  -H "authorization: Bearer ${TOKEN}" |
  grep '"action":"api_key.created"'

echo "Smoke checks passed."
