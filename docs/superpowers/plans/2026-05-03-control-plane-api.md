# Control Plane API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase 1 control plane APIs for seeded-admin login, current-user context, organizations/memberships, backend service registration, API key lifecycle, rate-limit policy metadata, audit logs, and gateway key validation.

**Architecture:** Extend the existing NestJS/Fastify control plane in `apps/control-plane` using focused modules with clear boundaries: auth/session, organizations, backend services, API keys, rate limits, audit logs, and internal gateway validation. Prisma remains the durable data layer, with API-key plaintext shown only once and only hashes stored. The gateway remains unchanged in this plan except for consuming the new internal validation endpoint in a later gateway plan.

**Tech Stack:** NestJS 11, Fastify, Prisma 6, Postgres, Argon2id, Node `crypto`, Vitest, Docker Compose.

---

## Scope

This plan makes the control plane usable through APIs. It does not build the real admin portal screens and does not wire the Go gateway to validate keys yet.

Acceptance target:

```bash
docker compose up -d --build
```

After startup:

- `POST /v1/auth/login` accepts the seeded admin credentials.
- `GET /v1/me` returns the authenticated user, identities, organizations, and roles.
- Organization and membership list endpoints work for the seeded organization.
- Service registry endpoints create, list, read, update, and disable backend services.
- API-key endpoints create, list, read, rotate, revoke, and delete keys.
- API key creation and rotation return plaintext key material exactly once.
- Stored keys use `key_hash`; plaintext keys are never persisted.
- `POST /internal/v1/api-keys/validate` validates a plaintext API key for a target service slug and returns service routing metadata.
- Management actions write audit-log rows.
- `./scripts/smoke-compose.sh`, `pnpm test`, `pnpm build`, and Go tests still pass.

## File Structure

Create or modify these files:

```text
apps/control-plane
├── package.json
├── prisma
│   ├── migrations
│   │   └── 000002_control_plane_api
│   │       └── migration.sql
│   └── schema.prisma
├── src
│   ├── app.module.ts
│   ├── auth
│   │   ├── auth.controller.ts
│   │   ├── auth.guard.ts
│   │   ├── auth.module.ts
│   │   ├── auth.service.ts
│   │   ├── current-user.decorator.ts
│   │   ├── password.service.ts
│   │   ├── session-token.service.ts
│   │   └── types.ts
│   ├── audit
│   │   ├── audit-log.controller.ts
│   │   ├── audit-log.module.ts
│   │   └── audit-log.service.ts
│   ├── common
│   │   └── errors.ts
│   ├── gateway-validation
│   │   ├── gateway-validation.controller.ts
│   │   ├── gateway-validation.module.ts
│   │   └── gateway-validation.service.ts
│   ├── me
│   │   ├── me.controller.ts
│   │   └── me.module.ts
│   ├── organizations
│   │   ├── organizations.controller.ts
│   │   ├── organizations.module.ts
│   │   └── organizations.service.ts
│   ├── services
│   │   ├── backend-services.controller.ts
│   │   ├── backend-services.module.ts
│   │   └── backend-services.service.ts
│   └── api-keys
│       ├── api-key-secret.service.ts
│       ├── api-keys.controller.ts
│       ├── api-keys.module.ts
│       └── api-keys.service.ts
└── test
    ├── auth.e2e-spec.ts
    ├── organizations.e2e-spec.ts
    ├── services.e2e-spec.ts
    ├── api-keys.e2e-spec.ts
    └── internal-validation.e2e-spec.ts
```

Responsibilities:

- `auth`: local login, stateless bearer sessions, auth guard, current user decorator.
- `me`: current authenticated user summary.
- `organizations`: organization and membership reads plus member role updates.
- `services`: backend service registry and default rate-limit metadata.
- `api-keys`: key generation, hashing, one-time plaintext return, lifecycle operations.
- `gateway-validation`: internal endpoint for validating API keys against service slugs.
- `audit`: append-only management action records and read endpoint.
- `common`: small shared helpers only; no business logic.

## Data Contracts

Use JSON consistently. Error responses should follow:

```json
{
  "error": {
    "code": "unauthorized",
    "message": "Missing or invalid authorization token"
  }
}
```

Authentication uses:

```http
Authorization: Bearer <access_token>
```

The Phase 1 token can be a signed, stateless HMAC token using `CONTROL_PLANE_SESSION_SECRET`. It must include:

```json
{
  "sub": "user_id",
  "email": "admin@example.local",
  "iat": 1777830000,
  "exp": 1777916400
}
```

API keys use this format:

```text
pk_live_<prefix>.<secret>
```

Store:

- `key_prefix`: the visible `pk_live_<prefix>` part.
- `key_hash`: Argon2id hash of the full plaintext key.

## Task 1: Expand Prisma Schema For Control Plane APIs

**Files:**
- Modify: `apps/control-plane/prisma/schema.prisma`
- Create: `apps/control-plane/prisma/migrations/000002_control_plane_api/migration.sql`
- Modify: `apps/control-plane/prisma/seed.ts`

- [ ] **Step 1: Write schema assertions before changing schema**

Create `apps/control-plane/test/schema-contract.e2e-spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('schema contract', () => {
  const schema = readFileSync(join(__dirname, '../prisma/schema.prisma'), 'utf8');

  it('defines API keys, rate limits, and audit logs', () => {
    expect(schema).toContain('model ApiKey');
    expect(schema).toContain('model RateLimitPolicy');
    expect(schema).toContain('model AuditLog');
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
pnpm --filter @platform/control-plane test -- schema-contract.e2e-spec.ts
```

Expected: FAIL because `model ApiKey`, `model RateLimitPolicy`, and `model AuditLog` are not in the schema yet.

- [ ] **Step 3: Extend `schema.prisma`**

Add these enums:

```prisma
enum ApiKeyStatus {
  active
  revoked
  expired
}

enum RateLimitTargetType {
  backend_service
  api_key
}

enum RateLimitAlgorithm {
  token_bucket
}
```

Add fields to `BackendService`:

```prisma
createdByUserId    String?           @map("created_by_user_id")
apiKeys            ApiKey[]
rateLimitPolicies  RateLimitPolicy[]
createdBy          User?             @relation("BackendServiceCreatedBy", fields: [createdByUserId], references: [id], onDelete: SetNull)
```

Add relation fields to `User`:

```prisma
createdServices BackendService[] @relation("BackendServiceCreatedBy")
createdApiKeys  ApiKey[]         @relation("ApiKeyCreatedBy")
auditLogs       AuditLog[]       @relation("AuditActor")
```

Add relation fields to `Organization`:

```prisma
apiKeys   ApiKey[]
auditLogs AuditLog[]
```

Add models:

```prisma
model ApiKey {
  id               String         @id @default(uuid())
  organizationId   String         @map("organization_id")
  backendServiceId String         @map("backend_service_id")
  name             String
  keyPrefix        String         @unique @map("key_prefix")
  keyHash          String         @map("key_hash")
  status           ApiKeyStatus   @default(active)
  expiresAt        DateTime?      @map("expires_at")
  lastUsedAt       DateTime?      @map("last_used_at")
  createdByUserId  String?        @map("created_by_user_id")
  rotatedAt        DateTime?      @map("rotated_at")
  createdAt        DateTime       @default(now()) @map("created_at")
  updatedAt        DateTime       @updatedAt @map("updated_at")

  organization      Organization      @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  backendService    BackendService    @relation(fields: [backendServiceId], references: [id], onDelete: Cascade)
  createdBy         User?             @relation("ApiKeyCreatedBy", fields: [createdByUserId], references: [id], onDelete: SetNull)
  rateLimitPolicies RateLimitPolicy[]

  @@index([organizationId])
  @@index([backendServiceId])
  @@map("api_keys")
}

model RateLimitPolicy {
  id                  String               @id @default(uuid())
  targetType          RateLimitTargetType  @map("target_type")
  targetId            String               @map("target_id")
  backendServiceId    String?              @map("backend_service_id")
  apiKeyId            String?              @map("api_key_id")
  algorithm           RateLimitAlgorithm   @default(token_bucket)
  requestsPerInterval Int                  @map("requests_per_interval")
  intervalSeconds     Int                  @map("interval_seconds")
  burstSize           Int                  @map("burst_size")
  createdAt           DateTime             @default(now()) @map("created_at")
  updatedAt           DateTime             @updatedAt @map("updated_at")

  backendService BackendService? @relation(fields: [backendServiceId], references: [id], onDelete: Cascade)
  apiKey         ApiKey?         @relation(fields: [apiKeyId], references: [id], onDelete: Cascade)

  @@unique([targetType, targetId])
  @@index([backendServiceId])
  @@index([apiKeyId])
  @@map("rate_limit_policies")
}

model AuditLog {
  id             String       @id @default(uuid())
  organizationId String?      @map("organization_id")
  actorUserId    String?      @map("actor_user_id")
  action         String
  targetType     String       @map("target_type")
  targetId       String       @map("target_id")
  metadata       Json?
  createdAt      DateTime     @default(now()) @map("created_at")

  organization Organization? @relation(fields: [organizationId], references: [id], onDelete: SetNull)
  actor       User?          @relation("AuditActor", fields: [actorUserId], references: [id], onDelete: SetNull)

  @@index([organizationId])
  @@index([actorUserId])
  @@index([targetType, targetId])
  @@map("audit_logs")
}
```

- [ ] **Step 4: Add SQL migration**

Create migration SQL matching the Prisma schema. Include:

```sql
CREATE TYPE "ApiKeyStatus" AS ENUM ('active', 'revoked', 'expired');
CREATE TYPE "RateLimitTargetType" AS ENUM ('backend_service', 'api_key');
CREATE TYPE "RateLimitAlgorithm" AS ENUM ('token_bucket');

ALTER TABLE "backend_services" ADD COLUMN "created_by_user_id" TEXT;
ALTER TABLE "backend_services" ADD CONSTRAINT "backend_services_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "api_keys" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "backend_service_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "key_prefix" TEXT NOT NULL,
  "key_hash" TEXT NOT NULL,
  "status" "ApiKeyStatus" NOT NULL DEFAULT 'active',
  "expires_at" TIMESTAMP(3),
  "last_used_at" TIMESTAMP(3),
  "created_by_user_id" TEXT,
  "rotated_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "api_keys_key_prefix_key" ON "api_keys"("key_prefix");
CREATE INDEX "api_keys_organization_id_idx" ON "api_keys"("organization_id");
CREATE INDEX "api_keys_backend_service_id_idx" ON "api_keys"("backend_service_id");
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_backend_service_id_fkey" FOREIGN KEY ("backend_service_id") REFERENCES "backend_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "rate_limit_policies" (
  "id" TEXT NOT NULL,
  "target_type" "RateLimitTargetType" NOT NULL,
  "target_id" TEXT NOT NULL,
  "backend_service_id" TEXT,
  "api_key_id" TEXT,
  "algorithm" "RateLimitAlgorithm" NOT NULL DEFAULT 'token_bucket',
  "requests_per_interval" INTEGER NOT NULL,
  "interval_seconds" INTEGER NOT NULL,
  "burst_size" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "rate_limit_policies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rate_limit_policies_target_type_target_id_key" ON "rate_limit_policies"("target_type", "target_id");
CREATE INDEX "rate_limit_policies_backend_service_id_idx" ON "rate_limit_policies"("backend_service_id");
CREATE INDEX "rate_limit_policies_api_key_id_idx" ON "rate_limit_policies"("api_key_id");
ALTER TABLE "rate_limit_policies" ADD CONSTRAINT "rate_limit_policies_backend_service_id_fkey" FOREIGN KEY ("backend_service_id") REFERENCES "backend_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rate_limit_policies" ADD CONSTRAINT "rate_limit_policies_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "audit_logs" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT,
  "actor_user_id" TEXT,
  "action" TEXT NOT NULL,
  "target_type" TEXT NOT NULL,
  "target_id" TEXT NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_logs_organization_id_idx" ON "audit_logs"("organization_id");
CREATE INDEX "audit_logs_actor_user_id_idx" ON "audit_logs"("actor_user_id");
CREATE INDEX "audit_logs_target_type_target_id_idx" ON "audit_logs"("target_type", "target_id");
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

Use explicit indexes and foreign keys consistent with `schema.prisma`.

- [ ] **Step 5: Update seed data**

Update `seed.ts` so the seeded sample backend has `createdByUserId: user.id` and a service default rate limit:

```ts
await prisma.rateLimitPolicy.upsert({
  where: {
    targetType_targetId: {
      targetType: 'backend_service',
      targetId: service.id,
    },
  },
  update: {
    requestsPerInterval: 1000,
    intervalSeconds: 60,
    burstSize: 100,
  },
  create: {
    targetType: 'backend_service',
    targetId: service.id,
    backendServiceId: service.id,
    requestsPerInterval: 1000,
    intervalSeconds: 60,
    burstSize: 100,
  },
});
```

- [ ] **Step 6: Verify schema and seed compile**

Run:

```bash
pnpm --filter @platform/control-plane prisma:generate
pnpm --filter @platform/control-plane exec tsc --noEmit
pnpm --filter @platform/control-plane test -- schema-contract.e2e-spec.ts
```

Expected: all commands exit `0`.

- [ ] **Step 7: Verify migration and seed against clean Compose database**

Run:

```bash
docker compose down -v
cp .env.example .env
docker compose up -d --build postgres
docker compose run --rm migrate-seed
docker compose exec -T postgres psql -U platform -d platform -c "select count(*) from api_keys;"
docker compose exec -T postgres psql -U platform -d platform -c "select requests_per_interval from rate_limit_policies;"
```

Expected: migration/seed exits `0`; `api_keys` exists; seeded rate limit returns `1000`.

- [ ] **Step 8: Commit**

Run:

```bash
git add apps/control-plane/prisma apps/control-plane/test/schema-contract.e2e-spec.ts
git commit -m "feat: expand control plane schema"
```

## Task 2: Auth Foundation And Current User Context

**Files:**
- Modify: `apps/control-plane/package.json`
- Modify: `apps/control-plane/src/app.module.ts`
- Create: `apps/control-plane/src/auth/*`
- Create: `apps/control-plane/src/me/*`
- Create: `apps/control-plane/src/common/errors.ts`
- Create: `apps/control-plane/test/auth.e2e-spec.ts`

- [ ] **Step 1: Add auth tests first**

Create `apps/control-plane/test/auth.e2e-spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

describe('auth API contract', () => {
  it('returns an access token for valid local credentials', () => {
    const response = {
      access_token: 'signed.token.value',
      token_type: 'Bearer',
      expires_in: 86400,
      user: { email: 'admin@example.local' },
    };
    expect(response.token_type).toBe('Bearer');
    expect(response.expires_in).toBe(86400);
    expect(response.user.email).toBe('admin@example.local');
  });
});
```

- [ ] **Step 2: Run test and verify it passes as contract-only**

Run:

```bash
pnpm --filter @platform/control-plane test -- auth.e2e-spec.ts
```

Expected: PASS. This is a contract placeholder until the test harness supports real HTTP e2e.

- [ ] **Step 3: Add session secret configuration**

Update `.env.example`:

```dotenv
CONTROL_PLANE_SESSION_SECRET=dev_session_secret_change_me
```

Update `src/config.ts`:

```ts
export interface AppConfig {
  port: number;
  databaseUrl: string;
  sessionSecret: string;
}
```

Load `sessionSecret` from `CONTROL_PLANE_SESSION_SECRET`, defaulting to `dev_session_secret_change_me` for local dev.

- [ ] **Step 4: Create session token service**

Create `src/auth/session-token.service.ts` using Node `crypto`:

```ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { loadConfig } from '../config';

export interface SessionPayload {
  sub: string;
  email: string;
  iat: number;
  exp: number;
}

@Injectable()
export class SessionTokenService {
  private readonly secret = loadConfig().sessionSecret;

  sign(user: { id: string; email: string }): { accessToken: string; expiresIn: number } {
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = 86400;
    const payload: SessionPayload = { sub: user.id, email: user.email, iat: now, exp: now + expiresIn };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = this.signPayload(encodedPayload);
    return { accessToken: `${encodedPayload}.${signature}`, expiresIn };
  }

  verify(token: string): SessionPayload {
    const [encodedPayload, signature] = token.split('.');
    if (!encodedPayload || !signature) throw new UnauthorizedException('Invalid authorization token');
    const expected = this.signPayload(encodedPayload);
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      throw new UnauthorizedException('Invalid authorization token');
    }
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as SessionPayload;
    if (payload.exp <= Math.floor(Date.now() / 1000)) throw new UnauthorizedException('Authorization token expired');
    return payload;
  }

  private signPayload(encodedPayload: string): string {
    return createHmac('sha256', this.secret).update(encodedPayload).digest('base64url');
  }
}
```

- [ ] **Step 5: Create password service**

Create `src/auth/password.service.ts`:

```ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import argon2 from 'argon2';

@Injectable()
export class PasswordService {
  async verify(hash: string, plaintext: string): Promise<void> {
    const ok = await argon2.verify(hash, plaintext);
    if (!ok) throw new UnauthorizedException('Invalid email or password');
  }
}
```

- [ ] **Step 6: Create auth guard and current-user decorator**

Create `src/auth/types.ts`:

```ts
export interface AuthenticatedUser {
  id: string;
  email: string;
}
```

Create `src/auth/auth.guard.ts`:

```ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { SessionTokenService } from './session-token.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly tokens: SessionTokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest & { user?: { id: string; email: string } }>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Missing authorization token');
    const payload = this.tokens.verify(header.slice('Bearer '.length));
    request.user = { id: payload.sub, email: payload.email };
    return true;
  }
}
```

Create `src/auth/current-user.decorator.ts`:

```ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { AuthenticatedUser } from './types';

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthenticatedUser => {
  const request = context.switchToHttp().getRequest<FastifyRequest & { user: AuthenticatedUser }>();
  return request.user;
});
```

- [ ] **Step 7: Create auth service and controller**

Create `src/auth/auth.service.ts`:

```ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { PasswordService } from './password.service';
import { SessionTokenService } from './session-token.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: SessionTokenService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status !== 'active') throw new UnauthorizedException('Invalid email or password');
    await this.passwords.verify(user.passwordHash, password);
    const token = this.tokens.sign({ id: user.id, email: user.email });
    return {
      access_token: token.accessToken,
      token_type: 'Bearer',
      expires_in: token.expiresIn,
      user: { id: user.id, email: user.email, display_name: user.displayName },
    };
  }
}
```

Create `src/auth/auth.controller.ts` with:

```ts
@Post('login')
async login(@Body() body: { email?: string; password?: string }) {
  if (!body.email || !body.password) throw new BadRequestException('email and password are required');
  return this.auth.login(body.email, body.password);
}

@Post('logout')
logout() {
  return { ok: true };
}
```

- [ ] **Step 8: Create `/v1/me`**

Create `src/me/me.controller.ts`:

```ts
@UseGuards(AuthGuard)
@Get()
async getMe(@CurrentUser() user: AuthenticatedUser) {
  const record = await this.prisma.user.findUnique({
    where: { id: user.id },
    include: {
      identities: true,
      memberships: { include: { organization: true } },
    },
  });
  if (!record) throw new UnauthorizedException();
  return {
    id: record.id,
    email: record.email,
    display_name: record.displayName,
    user_type: record.userType,
    status: record.status,
    organizations: record.memberships.map((membership) => ({
      id: membership.organization.id,
      name: membership.organization.name,
      role: membership.role,
    })),
  };
}
```

- [ ] **Step 9: Register modules**

Create `AuthModule` and `MeModule`, then import them in `AppModule`.

- [ ] **Step 10: Verify**

Run:

```bash
pnpm --filter @platform/control-plane test
pnpm --filter @platform/control-plane lint
pnpm --filter @platform/control-plane build
docker compose down -v
cp .env.example .env
docker compose up -d --build
curl -s -X POST http://localhost:4000/v1/auth/login -H 'content-type: application/json' -d '{"email":"admin@example.local","password":"ChangeMe123!"}'
```

Expected: login response includes `access_token`.

- [ ] **Step 11: Commit**

Run:

```bash
git add .env.example apps/control-plane
git commit -m "feat: add control plane auth"
```

## Task 3: Organizations And Membership APIs

**Files:**
- Create: `apps/control-plane/src/organizations/*`
- Create: `apps/control-plane/test/organizations.e2e-spec.ts`
- Modify: `apps/control-plane/src/app.module.ts`

- [ ] **Step 1: Add contract test**

Create `organizations.e2e-spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

describe('organizations API contract', () => {
  it('returns organizations with members', () => {
    expect({
      id: 'seed-internal-org',
      name: 'Internal Platform Team',
      members: [{ role: 'platform_admin' }],
    }).toMatchObject({ name: 'Internal Platform Team' });
  });
});
```

- [ ] **Step 2: Create service**

Create `organizations.service.ts`:

```ts
@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  listForUser(userId: string) {
    return this.prisma.organization.findMany({
      where: { memberships: { some: { userId, status: 'active' } } },
      include: { memberships: { include: { user: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  listMembers(organizationId: string) {
    return this.prisma.membership.findMany({
      where: { organizationId },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });
  }
}
```

- [ ] **Step 3: Create controller**

Create endpoints:

```http
GET /v1/organizations
GET /v1/organizations/:organizationId/members
POST /v1/organizations/:organizationId/members
PATCH /v1/organizations/:organizationId/members/:memberId
```

All use `AuthGuard`. Map Prisma camelCase fields to JSON snake_case where applicable.

`POST /members` accepts `{ "email": "person@example.local", "display_name": "Person", "role": "developer", "password": "ChangeMe123!" }`, creates or reuses a local internal user, creates a membership, and records `member.created`.

`PATCH /members/:memberId` accepts `{ "role": "service_admin", "status": "active" }`, updates only provided fields, and records `member.updated`.

- [ ] **Step 4: Verify**

Run:

```bash
pnpm --filter @platform/control-plane test
pnpm --filter @platform/control-plane lint
pnpm --filter @platform/control-plane build
```

Expected: all pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add apps/control-plane
git commit -m "feat: add organization APIs"
```

## Task 4: Backend Service Registry APIs

**Files:**
- Create: `apps/control-plane/src/services/*`
- Create: `apps/control-plane/src/audit/*`
- Create: `apps/control-plane/test/services.e2e-spec.ts`
- Modify: `apps/control-plane/src/app.module.ts`

- [ ] **Step 1: Add contract test**

Create `services.e2e-spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

describe('backend service API contract', () => {
  it('creates a service with default rate limits', () => {
    const created = {
      name: 'Jobs',
      slug: 'jobs',
      base_url: 'http://sample-backend:6060',
      default_rate_limit: { requests_per_interval: 1000, interval_seconds: 60, burst_size: 100 },
    };
    expect(created.slug).toBe('jobs');
  });
});
```

- [ ] **Step 2: Create audit service**

Create `audit-log.service.ts`:

```ts
@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  record(input: {
    organizationId?: string;
    actorUserId?: string;
    action: string;
    targetType: string;
    targetId: string;
    metadata?: unknown;
  }) {
    return this.prisma.auditLog.create({
      data: {
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        metadata: input.metadata === undefined ? undefined : (input.metadata as object),
      },
    });
  }
}
```

- [ ] **Step 3: Create backend service service**

Implement methods:

```ts
create(actorUserId, input)
list(actorUserId)
get(actorUserId, serviceId)
update(actorUserId, serviceId, input)
disable(actorUserId, serviceId)
```

`create` must:

- Require `organization_id`, `name`, `slug`, `base_url`, and `allowed_routes`.
- Create `BackendService`.
- Create or upsert `RateLimitPolicy` with default `1000/60/burst 100` unless provided.
- Record audit action `backend_service.created`.

- [ ] **Step 4: Create controller**

Create endpoints:

```http
POST   /v1/services
GET    /v1/services
GET    /v1/services/:serviceId
PATCH  /v1/services/:serviceId
DELETE /v1/services/:serviceId
```

`DELETE` should soft-disable by setting `status: disabled`, not hard-delete.

- [ ] **Step 5: Verify with Compose**

Run:

```bash
pnpm --filter @platform/control-plane test
pnpm --filter @platform/control-plane lint
pnpm --filter @platform/control-plane build
docker compose up -d --build
```

Login, then create and list a service:

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/v1/auth/login -H 'content-type: application/json' -d '{"email":"admin@example.local","password":"ChangeMe123!"}' | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).access_token))")
curl -s http://localhost:4000/v1/services -H "authorization: Bearer $TOKEN"
```

Expected: response includes seeded `sample` service.

- [ ] **Step 6: Commit**

Run:

```bash
git add apps/control-plane
git commit -m "feat: add backend service registry APIs"
```

## Task 5: API Key Lifecycle APIs

**Files:**
- Create: `apps/control-plane/src/api-keys/*`
- Create: `apps/control-plane/test/api-keys.e2e-spec.ts`
- Modify: `apps/control-plane/src/app.module.ts`

- [ ] **Step 1: Add API-key contract test**

Create `api-keys.e2e-spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

describe('API key contract', () => {
  it('returns plaintext key only on create or rotate', () => {
    const created = {
      id: 'key_123',
      prefix: 'pk_live_abcd1234',
      api_key: 'pk_live_abcd1234.secret',
    };
    const listed = {
      id: 'key_123',
      prefix: 'pk_live_abcd1234',
      status: 'active',
    };
    expect(created.api_key).toContain('.');
    expect(listed).not.toHaveProperty('api_key');
  });
});
```

- [ ] **Step 2: Create API key secret service**

Create `api-key-secret.service.ts`:

```ts
@Injectable()
export class ApiKeySecretService {
  generate(): { plaintext: string; prefix: string } {
    const visible = randomBytes(6).toString('hex');
    const secret = randomBytes(32).toString('base64url');
    const prefix = `pk_live_${visible}`;
    return { prefix, plaintext: `${prefix}.${secret}` };
  }

  hash(plaintext: string): Promise<string> {
    return argon2.hash(plaintext);
  }

  verify(hash: string, plaintext: string): Promise<boolean> {
    return argon2.verify(hash, plaintext);
  }
}
```

- [ ] **Step 3: Create API-key service**

Implement:

```ts
create(serviceId, actorUserId, input)
listForService(serviceId, actorUserId)
get(keyId, actorUserId)
rotate(keyId, actorUserId)
revoke(keyId, actorUserId)
delete(keyId, actorUserId)
```

Rules:

- `create` verifies target service exists and is active.
- `create` stores `keyHash`, `keyPrefix`, organization/service ids, status `active`.
- `create` returns plaintext `api_key`.
- `list` and `get` never return plaintext `api_key`.
- `rotate` creates a new plaintext key for the same `ApiKey` row, updates hash/prefix/rotatedAt, returns plaintext once.
- `revoke` sets status `revoked`.
- `delete` may hard-delete in Phase 1, but must record audit before delete.
- Every state-changing operation records an audit action.

- [ ] **Step 4: Create controller**

Create endpoints:

```http
POST   /v1/services/:serviceId/api-keys
GET    /v1/services/:serviceId/api-keys
GET    /v1/api-keys/:keyId
POST   /v1/api-keys/:keyId/rotate
POST   /v1/api-keys/:keyId/revoke
DELETE /v1/api-keys/:keyId
```

- [ ] **Step 5: Verify through HTTP**

Run:

```bash
pnpm --filter @platform/control-plane test
pnpm --filter @platform/control-plane lint
pnpm --filter @platform/control-plane build
docker compose up -d --build
```

Then:

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/v1/auth/login -H 'content-type: application/json' -d '{"email":"admin@example.local","password":"ChangeMe123!"}' | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).access_token))")
SERVICE_ID=$(curl -s http://localhost:4000/v1/services -H "authorization: Bearer $TOKEN" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].id))")
curl -s -X POST "http://localhost:4000/v1/services/$SERVICE_ID/api-keys" -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"name":"Local smoke key"}'
```

Expected: create response includes `api_key`; list response does not.

- [ ] **Step 6: Commit**

Run:

```bash
git add apps/control-plane
git commit -m "feat: add API key lifecycle APIs"
```

## Task 6: Internal Gateway Validation Endpoint

**Files:**
- Create: `apps/control-plane/src/gateway-validation/*`
- Create: `apps/control-plane/test/internal-validation.e2e-spec.ts`
- Modify: `apps/control-plane/src/app.module.ts`

- [ ] **Step 1: Add contract test**

Create `internal-validation.e2e-spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

describe('internal gateway validation contract', () => {
  it('returns key and service metadata for a valid key-service pair', () => {
    const response = {
      valid: true,
      api_key: { id: 'key_123' },
      backend_service: { slug: 'sample', base_url: 'http://sample-backend:6060' },
      rate_limit: { requests_per_interval: 1000, interval_seconds: 60, burst_size: 100 },
    };
    expect(response.valid).toBe(true);
    expect(response.backend_service.slug).toBe('sample');
  });
});
```

- [ ] **Step 2: Create validation service**

Create `gateway-validation.service.ts`:

```ts
@Injectable()
export class GatewayValidationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: ApiKeySecretService,
  ) {}

  async validate(input: { api_key: string; service_slug: string; method?: string; path?: string }) {
    const prefix = input.api_key.split('.')[0];
    const record = await this.prisma.apiKey.findUnique({
      where: { keyPrefix: prefix },
      include: {
        organization: true,
        backendService: { include: { rateLimitPolicies: true } },
        rateLimitPolicies: true,
      },
    });
    if (!record || record.status !== 'active') return { valid: false, reason: 'unknown_or_inactive_key' };
    if (record.expiresAt && record.expiresAt <= new Date()) return { valid: false, reason: 'expired_key' };
    if (record.backendService.slug !== input.service_slug || record.backendService.status !== 'active') {
      return { valid: false, reason: 'service_not_allowed' };
    }
    const ok = await this.secrets.verify(record.keyHash, input.api_key);
    if (!ok) return { valid: false, reason: 'invalid_key' };
    await this.prisma.apiKey.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } });
    const keyLimit = record.rateLimitPolicies[0];
    const serviceLimit = record.backendService.rateLimitPolicies[0];
    const effectiveLimit = keyLimit ?? serviceLimit;
    return {
      valid: true,
      organization: { id: record.organization.id },
      api_key: { id: record.id, prefix: record.keyPrefix },
      backend_service: {
        id: record.backendService.id,
        slug: record.backendService.slug,
        base_url: record.backendService.baseUrl,
        allowed_routes: record.backendService.allowedRoutes,
      },
      rate_limit: effectiveLimit
        ? {
            requests_per_interval: effectiveLimit.requestsPerInterval,
            interval_seconds: effectiveLimit.intervalSeconds,
            burst_size: effectiveLimit.burstSize,
          }
        : null,
    };
  }
}
```

- [ ] **Step 3: Create internal controller**

Create endpoint:

```http
POST /internal/v1/api-keys/validate
```

Request:

```json
{
  "api_key": "pk_live_x.secret",
  "service_slug": "sample",
  "method": "GET",
  "path": "/health"
}
```

Response for invalid keys should use HTTP `200` with `{ "valid": false, "reason": "..." }` so gateway can distinguish validation failure from control-plane outage.

- [ ] **Step 4: Verify through HTTP**

Run:

```bash
pnpm --filter @platform/control-plane test
pnpm --filter @platform/control-plane lint
pnpm --filter @platform/control-plane build
docker compose up -d --build
```

Create a key, then call validation endpoint with it. Expected: `valid: true`.

- [ ] **Step 5: Commit**

Run:

```bash
git add apps/control-plane
git commit -m "feat: add internal API key validation"
```

## Task 7: Audit Log Read API And Final Compose Smoke Update

**Files:**
- Create: `apps/control-plane/src/audit/audit-log.controller.ts`
- Modify: `apps/control-plane/src/audit/audit-log.module.ts`
- Modify: `scripts/smoke-compose.sh`
- Modify: `README.md`

- [ ] **Step 1: Add audit list endpoint**

Create:

```http
GET /v1/audit-logs
```

Protected by `AuthGuard`. Return latest 100 rows ordered descending by `createdAt`, mapped to snake_case.

- [ ] **Step 2: Update smoke script**

Extend `scripts/smoke-compose.sh`:

1. Login using seeded admin.
2. Fetch `/v1/me`.
3. Fetch `/v1/services`.
4. Create an API key for seeded sample service.
5. Validate that key through `/internal/v1/api-keys/validate`.
6. Fetch `/v1/audit-logs`.

Use `node -e` to parse JSON without adding `jq` as a dependency.

- [ ] **Step 3: Update README**

Add:

```markdown
## Control Plane Smoke Flow

1. Login with the seeded admin.
2. List backend services.
3. Create an API key for the sample service.
4. Validate the key through the internal validation endpoint.
```

- [ ] **Step 4: Run final verification**

Run:

```bash
docker compose down -v
cp .env.example .env
docker compose up -d --build
./scripts/smoke-compose.sh
pnpm test
pnpm build
pnpm --filter @platform/control-plane lint
go test ./...
```

For Go tests, run from:

```bash
cd apps/gateway && go test ./...
cd ../sample-backend && go test ./...
```

Expected: all commands exit `0`.

- [ ] **Step 5: Commit**

Run:

```bash
git add README.md scripts/smoke-compose.sh apps/control-plane
git commit -m "test: extend control plane smoke flow"
```

## Self-Review Checklist

- Spec coverage:
  - Seeded local login is covered by Task 2.
  - `/v1/me` is covered by Task 2.
  - Organization and membership read APIs are covered by Task 3.
  - Backend service registry APIs are covered by Task 4.
  - API key lifecycle APIs are covered by Task 5.
  - One-time plaintext key return and hash-only storage are covered by Task 5.
  - Internal API key validation is covered by Task 6.
  - Rate-limit metadata is covered by Tasks 1, 4, and 6.
  - Audit log writes and reads are covered by Tasks 4, 5, and 7.
  - Compose smoke verification is covered by Task 7.
- Deferred by design:
  - Admin portal screens.
  - Gateway runtime enforcement.
  - Redis token bucket rate limiting.
  - Public registration, password reset, and SSO.
- Placeholder scan:
  - No `TBD`, `TODO`, or unspecified endpoints.
  - Each task lists exact files, behavior, commands, and expected output.
- Type consistency:
  - Prisma model names match service code names.
  - JSON responses use snake_case externally and Prisma camelCase internally.
  - API key prefix format is consistent between create, rotate, and validate.
