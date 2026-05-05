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

echo "Checking gateway enforcement — missing key returns 401..."
HTTP_CODE="$(curl --silent --show-error -o /dev/null -w '%{http_code}' http://localhost:8080/proxy/sample/health)"
test "${HTTP_CODE}" = "401" || { echo "Expected 401 for missing key, got ${HTTP_CODE}"; exit 1; }

echo "Checking gateway enforcement — invalid key returns 401..."
HTTP_CODE="$(curl --silent --show-error -o /dev/null -w '%{http_code}' http://localhost:8080/proxy/sample/health -H 'authorization: Bearer pk_live_bad.invalidkey12345678901234567890')"
test "${HTTP_CODE}" = "401" || { echo "Expected 401 for invalid key, got ${HTTP_CODE}"; exit 1; }

echo "Checking gateway enforcement — valid key returns 200..."
HTTP_CODE="$(curl --silent --show-error -o /dev/null -w '%{http_code}' http://localhost:8080/proxy/sample/health -H "authorization: Bearer ${API_KEY}")"
test "${HTTP_CODE}" = "200" || { echo "Expected 200 for valid key, got ${HTTP_CODE}"; exit 1; }

echo "Checking gateway enforcement — valid proxy returns rate-limit headers..."
curl --fail --silent --show-error http://localhost:8080/proxy/sample/health -H "authorization: Bearer ${API_KEY}" -i | grep -i 'x-ratelimit-limit'

echo "Checking gateway enforcement — valid proxy returns upstream response..."
curl --fail --silent --show-error http://localhost:8080/proxy/sample/health -H "authorization: Bearer ${API_KEY}" | grep '"service":"sample-backend"'

echo "Checking audit logs..."
curl --fail --silent --show-error http://localhost:4000/v1/audit-logs \
  -H "authorization: Bearer ${TOKEN}" |
  grep '"action":"api_key.created"'

echo "Smoke checks passed."
