# API Key Platform Service Design

Date: 2026-05-01

## Summary

Build a production-shaped platform for managing users, teams, backend services, API keys, and gateway-enforced access to internal services.

Phase 1 is internal-only and does not include public registration. Users are seeded or admin-created. The system should still use a unified account model so external registration can be added later without redesigning users, organizations, roles, or API keys.

The platform has two main runtime services:

- Platform control plane: owns users, organizations, memberships, roles, backend service registration, API key lifecycle, rate-limit policy, and audit logs.
- API gateway: owns request-time API key validation, rate limiting, service resolution, routing, and upstream forwarding.

## Goals

- Let internal teams use platform-issued API keys to access registered backend services.
- Allow platform admins and team/service admins to register backend services.
- Make backend onboarding plug-and-play for normal HTTP services, including services running at targets such as `http://localhost:6060`.
- Keep backend services mostly unaware of public API keys by enforcing authentication at the gateway.
- Provide production-standard key handling, revocation, rotation, rate limiting, audit logs, and observability.
- Keep the data model ready for external users in a later phase.

## Non-Goals For Phase 1

- Public self-registration.
- External customer onboarding.
- Password reset and email verification.
- Social login.
- Billing or usage-based pricing.
- Fine-grained API scopes.
- Complex external policy engine.
- Polished developer portal.
- Multi-region active-active gateway.

## Core Architecture

Use a control-plane/data-plane split.

The control plane answers:

- Who are the users?
- Which organizations or teams exist?
- What roles does each user have?
- Which backend services are registered?
- Which API keys exist?
- Which rate-limit policies apply?
- What management actions happened?

The gateway answers:

- Is this live request authenticated?
- Is the key active and valid?
- Is the key allowed to access the requested backend service?
- Is the request within its rate limit?
- Where should the request be forwarded?

Core infrastructure:

- Postgres for durable platform data.
- Redis for gateway-side key/config cache and token bucket rate limiting.
- Secrets manager or KMS for encryption material, signing secrets, and upstream credentials.
- Structured logs, metrics, and traces for operations.

## Unified User Model

Internal and external users should share the same domain model.

Identity provider is how a user logs in. User is who they are in the platform. Membership and role define what they can manage. API key is the machine credential issued under that authority.

Phase 1 supports seeded or admin-created users with local password login. External registration and SSO are added later as onboarding and identity paths, not as separate user systems.

Core identity concepts:

- `User`: a person/account inside the platform.
- `Identity`: login source, such as local password login now and SSO or social login later.
- `Organization`: an internal team now, customer or partner later.
- `Membership`: a user's relationship to an organization.
- `Role`: permission level for platform and organization actions.

Internal users must not be treated as automatically privileged. Permissions come from role and membership.

## Roles

Initial roles:

- `platform_admin`: can manage all organizations, users, services, keys, and platform settings.
- `org_admin`: can manage members, services, and keys within an organization.
- `service_admin`: can manage assigned backend services and their keys.
- `developer`: can create and manage API keys where permitted.
- `viewer`: can view metadata and usage where permitted.

The exact permission matrix can be implemented as RBAC policies around these roles.

## Data Model

### User

- `id`
- `email`
- `display_name`
- `user_type`: `internal` or `external`
- `status`: `active`, `suspended`, or `deleted`
- `created_at`
- `updated_at`

### Identity

- `id`
- `user_id`
- `provider`: `local`, `company_sso`, `password`, `google`, `github`, or another future provider
- `provider_subject`
- `email_verified`
- `created_at`

### Organization

- `id`
- `name`
- `organization_type`: `internal`, `customer`, or `partner`
- `status`
- `created_at`

### Membership

- `id`
- `user_id`
- `organization_id`
- `role`
- `status`
- `created_at`

### BackendService

- `id`
- `organization_id`
- `name`
- `slug`
- `base_url`
- `allowed_routes`
- `upstream_auth_config`
- `default_rate_limit`
- `status`: `active` or `disabled`
- `created_by`
- `created_at`
- `updated_at`

### ApiKey

- `id`
- `organization_id`
- `backend_service_id`
- `name`
- `key_prefix`
- `key_hash`
- `status`: `active`, `revoked`, or `expired`
- `expires_at`
- `last_used_at`
- `created_by`
- `created_at`
- `rotated_at`

### RateLimitPolicy

- `id`
- `target_type`: `backend_service` or `api_key`
- `target_id`
- `algorithm`: `token_bucket`
- `requests_per_interval`
- `interval_seconds`
- `burst_size`

### AuditLog

- `id`
- `organization_id`
- `actor_user_id`
- `action`
- `target_type`
- `target_id`
- `metadata`
- `created_at`

## Backend Service Registration

A backend service is a registered upstream target owned by an organization.

Example registration:

```json
{
  "name": "Local Jobs Service",
  "slug": "jobs",
  "base_url": "http://localhost:6060",
  "allowed_routes": [
    { "method": "GET", "path": "/v1/*" },
    { "method": "POST", "path": "/v1/jobs" }
  ],
  "default_rate_limit": {
    "requests_per_interval": 1000,
    "interval_seconds": 60,
    "burst_size": 100
  }
}
```

Client request:

```http
GET /proxy/jobs/v1/jobs
Authorization: Bearer pk_live_xxx
```

Gateway forwards:

```http
GET http://localhost:6060/v1/jobs
```

The backend service does not need to implement public API-key validation. It should trust only traffic from the gateway or private network.

Production protection options:

- Backend only listens on a private network.
- Firewall or security group allows only gateway traffic.
- Gateway uses upstream service authentication, such as mTLS or an internal bearer token.
- Backend accepts trusted `X-Platform-*` headers only from the gateway.

## API Key Model

For Phase 1, one API key maps to exactly one backend service.

Key handling requirements:

- Generate high-entropy random keys.
- Show plaintext API key only once at creation.
- Store only `key_hash`, never plaintext.
- Store `key_prefix` for lookup, display, and support.
- Use constant-time comparison when verifying hashes.
- Support expiration, revocation, rotation, and deletion.
- Never log plaintext API keys.
- Redact API keys from request logs and traces.

Phase 1 local user passwords should be stored with a modern password hashing algorithm such as Argon2id, with bcrypt as an acceptable fallback when Argon2id is unavailable.

Example create response:

```json
{
  "id": "key_123",
  "name": "CI pipeline key",
  "prefix": "pk_live_abc123",
  "api_key": "pk_live_abc123.full_secret_value_only_shown_once",
  "backend_service_id": "svc_123",
  "created_at": "2026-05-01T12:00:00Z"
}
```

List and get responses must show metadata only:

```json
{
  "id": "key_123",
  "name": "CI pipeline key",
  "prefix": "pk_live_abc123",
  "status": "active",
  "last_used_at": "2026-05-01T12:30:00Z"
}
```

## Control Plane APIs

Phase 1 user/session APIs:

```http
GET  /v1/me
POST /v1/auth/login
POST /v1/auth/logout
GET  /v1/organizations
GET  /v1/organizations/{organization_id}/members
POST /v1/organizations/{organization_id}/members
PATCH /v1/organizations/{organization_id}/members/{member_id}
```

Future authentication APIs:

```http
GET  /v1/auth/sso/login
GET  /v1/auth/sso/callback
POST /v1/auth/register
POST /v1/auth/password/reset
```

Backend service APIs:

```http
POST   /v1/services
GET    /v1/services
GET    /v1/services/{service_id}
PATCH  /v1/services/{service_id}
DELETE /v1/services/{service_id}
```

API key APIs:

```http
POST   /v1/services/{service_id}/api-keys
GET    /v1/services/{service_id}/api-keys
GET    /v1/api-keys/{key_id}
POST   /v1/api-keys/{key_id}/rotate
POST   /v1/api-keys/{key_id}/revoke
DELETE /v1/api-keys/{key_id}
```

Rate-limit APIs:

```http
GET /v1/services/{service_id}/rate-limit
PUT /v1/services/{service_id}/rate-limit
GET /v1/api-keys/{key_id}/rate-limit
PUT /v1/api-keys/{key_id}/rate-limit
```

Gateway/internal APIs:

```http
POST /internal/v1/api-keys/validate
GET  /internal/v1/services/{service_id}/gateway-config
```

The gateway should prefer local and Redis cache, with control-plane validation as a fallback for cache misses.

## Gateway Request Flow

1. Extract API key from `Authorization: Bearer` or `X-API-Key`.
2. Parse key prefix for candidate lookup.
3. Look up key and service config in local gateway cache.
4. On local miss, check Redis.
5. On Redis miss, call the control plane validation API.
6. Verify key hash securely.
7. Confirm key status is `active`, not expired, and not revoked.
8. Confirm the key is bound to the requested backend service.
9. Confirm method and path are allowed by service route policy.
10. Apply Redis-backed token bucket rate limiting.
11. Add sanitized forwarding headers.
12. Forward to the registered backend service.
13. Emit usage metrics and async usage events.

Forwarded metadata headers:

```http
X-Platform-Organization-Id: org_123
X-Platform-Service-Id: svc_123
X-Platform-Api-Key-Id: key_123
X-Platform-Request-Id: req_123
```

The gateway should not forward the original API key to backend services unless a deliberate compatibility mode is configured.

## Rate Limiting

Rate limiting is configured in the control plane and enforced by the gateway.

Use Redis-backed token bucket rate limiting in Phase 1.

Supported Phase 1 policies:

- Backend service default limit.
- Optional API-key-specific override.

Default model:

- If only a service limit exists, use the service limit.
- If a key-specific limit exists, use the stricter effective limit unless a platform admin explicitly allows override behavior.

Example default:

- `1000` requests per `60` seconds.
- Burst size `100`.

Rate limiting must happen before forwarding to backend services.

Return standard headers:

```http
X-RateLimit-Limit
X-RateLimit-Remaining
X-RateLimit-Reset
Retry-After
```

## Caching And Failure Behavior

Recommended cache behavior:

- Gateway local memory cache: `30-60` seconds.
- Redis key and service config cache: `5-15` minutes.
- Revocation, rotation, service disable, and organization suspension publish invalidation events.
- Gateway instances should evict affected local cache entries when they receive invalidation events.

Failure behavior:

- Cached active keys may continue working during a temporary control-plane outage until cache expiry.
- Unknown uncached keys fail closed when validation cannot be completed.
- Revoked keys fail closed once revocation is known.
- Redis outage should trigger degraded mode; the gateway may rely briefly on local cache for known keys but should fail closed for unknown keys and unavailable rate-limit checks according to environment policy.

## Gateway Error Responses

- `401 Unauthorized`: missing, malformed, or unknown API key.
- `403 Forbidden`: valid key but wrong service, disallowed route, disabled service, or suspended organization.
- `429 Too Many Requests`: rate limit exceeded.
- `502 Bad Gateway`: backend service unavailable or invalid upstream response.
- `503 Service Unavailable`: gateway cannot validate an uncached key or enforce required policy due to dependency outage.

Error bodies should be consistent and include a request ID.

## Audit And Usage

Audit logs record management actions:

- User created.
- Member added.
- Role changed.
- Backend service created, updated, disabled, or deleted.
- API key created, rotated, revoked, or deleted.
- Rate-limit policy changed.

Gateway usage events record runtime outcomes:

- Request allowed.
- Request denied.
- Request rate limited.
- Backend timeout or error.

High-volume gateway usage should not be written synchronously to Postgres in the request path. Emit logs, metrics, or queue events asynchronously. Update `ApiKey.last_used_at` asynchronously.

## Observability

Metrics:

- Gateway request count.
- Gateway latency.
- Gateway 4xx/5xx rates.
- Rate-limit block count.
- Key validation cache hit rate.
- Control-plane validation latency and error rate.
- Upstream backend latency and error rate.

Logs:

- Structured JSON.
- Include request ID, organization ID, service ID, key ID, status, latency, and upstream target.
- Redact API keys and secrets.

Traces:

- Gateway span.
- Control-plane validation span when used.
- Upstream backend span where possible.

Alerts:

- Elevated gateway 5xx.
- Redis unavailable.
- Control-plane validation failure spike.
- High rate-limit block spike.
- Backend service timeout spike.

## Phase 1 Delivery Scope

Phase 1 includes:

- Seeded or admin-created users.
- Login for admin-created users.
- Organizations and memberships.
- RBAC for platform admins, org admins, service admins, developers, and viewers.
- Backend service registry.
- API key create/list/get/rotate/revoke/delete.
- One API key maps to one backend service.
- Service default rate limits.
- Optional API-key-specific rate-limit overrides.
- Separate gateway service.
- Gateway route pattern `/proxy/{service_slug}/*`.
- Redis-backed token bucket rate limiting.
- Redis-backed key/service config cache.
- Postgres durable storage.
- Audit logs for management actions.
- Gateway logs and metrics for runtime traffic.

## Future Roadmap

Phase 2:

- External registration.
- Public login.
- Email verification.
- Password reset.
- SSO/OIDC for internal users.
- Customer organizations.
- Invite flows.
- Basic usage dashboard.
- API documentation pages.

Phase 3:

- Fine-grained API scopes.
- Route-level permissions.
- Endpoint-level rate limits.
- Daily and monthly quotas.
- Usage export.
- Billing integration.
- Webhooks for key lifecycle events.

Phase 4:

- Multi-region gateway deployment.
- Enterprise tenant controls.
- Advanced audit retention.
- Customer-managed security options.
- External policy engine if authorization rules become complex enough.

## Open Implementation Choices

These choices can be finalized during implementation planning:

- Exact backend language/framework.
- Exact password hashing library and operational parameters.
- Redis failure policy for rate limiting in each environment.
- Whether deleted API keys are soft-deleted or hard-deleted after retention.
- Whether route matching uses simple glob patterns or compiled route templates.
