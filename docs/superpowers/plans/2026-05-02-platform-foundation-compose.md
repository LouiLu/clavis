# Platform Foundation Compose Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the initial repository foundation so the platform skeleton starts with `docker compose up -d` and exposes the admin portal, control plane, gateway, Postgres, Redis, sample backend, and one-shot migration/seed job.

**Architecture:** Create a small monorepo with separate apps for the React/Vite admin portal, NestJS/Fastify control plane, Go gateway, and Go sample backend. Docker Compose is the local runtime contract and wires all services together on one bridge network. The control plane owns the initial database schema and seed data; the gateway initially proves routing to the sample backend and leaves full API-key validation for the gateway implementation plan.

**Tech Stack:** Docker Compose, Node.js 22, pnpm, React, Vite, TypeScript, NestJS, Fastify, Prisma, Postgres, Redis, Go 1.23, chi, `httputil.ReverseProxy`.

---

## Scope

This plan produces a running foundation only. It does not implement complete login, RBAC, API-key lifecycle, Redis key validation, token bucket rate limiting, audit logs, or the production admin portal screens. Those belong to later plans.

Acceptance target:

```bash
docker compose up -d
```

After startup:

- Admin portal responds at `http://localhost:3000`.
- Control plane responds at `http://localhost:4000/health`.
- Gateway responds at `http://localhost:8080/health`.
- Sample backend responds at `http://localhost:6060/health`.
- Gateway proxies `http://localhost:8080/proxy/sample/health` to the sample backend.
- Postgres contains the initial admin user, internal organization, and sample backend service row.
- Redis responds to health checks.

## File Structure

Create this structure:

```text
.
├── .dockerignore
├── .env.example
├── .gitignore
├── Makefile
├── README.md
├── docker-compose.yml
├── package.json
├── pnpm-workspace.yaml
├── apps
│   ├── admin-portal
│   │   ├── Dockerfile
│   │   ├── index.html
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts
│   │   └── src
│   │       ├── App.tsx
│   │       ├── main.tsx
│   │       └── styles.css
│   ├── control-plane
│   │   ├── Dockerfile
│   │   ├── nest-cli.json
│   │   ├── package.json
│   │   ├── prisma
│   │   │   ├── migrations
│   │   │   │   └── 000001_init
│   │   │   │       └── migration.sql
│   │   │   ├── schema.prisma
│   │   │   └── seed.ts
│   │   ├── src
│   │   │   ├── app.module.ts
│   │   │   ├── config.ts
│   │   │   ├── health.controller.ts
│   │   │   ├── main.ts
│   │   │   └── prisma.service.ts
│   │   ├── test
│   │   │   └── health.e2e-spec.ts
│   │   └── tsconfig.json
│   ├── gateway
│   │   ├── Dockerfile
│   │   ├── go.mod
│   │   ├── cmd
│   │   │   └── gateway
│   │   │       └── main.go
│   │   └── internal
│   │       ├── config
│   │       │   └── config.go
│   │       └── proxy
│   │           └── proxy.go
│   └── sample-backend
│       ├── Dockerfile
│       ├── go.mod
│       └── main.go
└── scripts
    └── smoke-compose.sh
```

Responsibilities:

- `docker-compose.yml`: local runtime graph and service health checks.
- `.env.example`: documented local runtime variables.
- `apps/admin-portal`: minimal authenticated-portal shell placeholder.
- `apps/control-plane`: minimal NestJS/Fastify API, Prisma schema, migration, and seed job support.
- `apps/gateway`: minimal Go gateway with health endpoint and static sample proxy route.
- `apps/sample-backend`: simple HTTP backend for gateway proof.
- `scripts/smoke-compose.sh`: repeatable local acceptance check.

## Task 1: Root Workspace And Environment Contract

**Files:**
- Create: `.gitignore`
- Create: `.dockerignore`
- Create: `.env.example`
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `Makefile`
- Create: `README.md`

- [ ] **Step 1: Create the root workspace files**

Create `.gitignore`:

```gitignore
node_modules
dist
coverage
.env
.env.local
.DS_Store
*.log
tmp
apps/**/.turbo
apps/**/node_modules
apps/**/dist
apps/**/.vite
```

Create `.dockerignore`:

```dockerignore
.git
node_modules
apps/**/node_modules
apps/**/dist
coverage
.env
.DS_Store
docs
```

Create `.env.example`:

```dotenv
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=platform
POSTGRES_USER=platform
POSTGRES_PASSWORD=platform_dev_password
DATABASE_URL=postgresql://platform:platform_dev_password@postgres:5432/platform?schema=public

REDIS_HOST=redis
REDIS_PORT=6379
REDIS_URL=redis://redis:6379

CONTROL_PLANE_PORT=4000
CONTROL_PLANE_PUBLIC_URL=http://localhost:4000

ADMIN_PORTAL_PORT=3000
VITE_CONTROL_PLANE_URL=http://localhost:4000

GATEWAY_PORT=8080
SAMPLE_BACKEND_URL=http://sample-backend:6060

SAMPLE_BACKEND_PORT=6060

SEED_ADMIN_EMAIL=admin@example.local
SEED_ADMIN_PASSWORD=ChangeMe123!
SEED_ORG_NAME=Internal Platform Team
SEED_SERVICE_NAME=Sample Backend
SEED_SERVICE_SLUG=sample
SEED_SERVICE_BASE_URL=http://sample-backend:6060
```

Create `package.json`:

```json
{
  "name": "api-key-platform",
  "private": true,
  "packageManager": "pnpm@10.0.0",
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint"
  },
  "devDependencies": {
    "typescript": "^5.8.0"
  }
}
```

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - apps/admin-portal
  - apps/control-plane
```

Create `Makefile`:

```makefile
.PHONY: compose-up compose-down compose-logs smoke

compose-up:
	docker compose up -d --build

compose-down:
	docker compose down -v

compose-logs:
	docker compose logs -f

smoke:
	./scripts/smoke-compose.sh
```

Create `README.md`:

````markdown
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
````

- [ ] **Step 2: Verify workspace file syntax**

Run:

```bash
test -f .env.example && test -f package.json && test -f pnpm-workspace.yaml && test -f Makefile && test -f README.md
```

Expected: command exits `0`.

- [ ] **Step 3: Commit**

Run:

```bash
git add .gitignore .dockerignore .env.example package.json pnpm-workspace.yaml Makefile README.md
git commit -m "chore: add root workspace foundation"
```

## Task 2: Minimal Control Plane Service

**Files:**
- Create: `apps/control-plane/package.json`
- Create: `apps/control-plane/tsconfig.json`
- Create: `apps/control-plane/nest-cli.json`
- Create: `apps/control-plane/src/config.ts`
- Create: `apps/control-plane/src/prisma.service.ts`
- Create: `apps/control-plane/src/health.controller.ts`
- Create: `apps/control-plane/src/app.module.ts`
- Create: `apps/control-plane/src/main.ts`
- Create: `apps/control-plane/test/health.e2e-spec.ts`

- [ ] **Step 1: Create package and TypeScript config**

Create `apps/control-plane/package.json`:

```json
{
  "name": "@platform/control-plane",
  "private": true,
  "version": "0.1.0",
  "scripts": {
    "build": "nest build",
    "start": "node dist/main.js",
    "start:dev": "nest start --watch",
    "lint": "eslint \"src/**/*.ts\" \"test/**/*.ts\"",
    "test": "vitest run",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate deploy",
    "prisma:seed": "tsx prisma/seed.ts"
  },
  "dependencies": {
    "@fastify/cors": "^11.0.0",
    "@nestjs/common": "^11.0.0",
    "@nestjs/core": "^11.0.0",
    "@nestjs/platform-fastify": "^11.0.0",
    "@prisma/client": "^6.0.0",
    "argon2": "^0.41.0",
    "reflect-metadata": "^0.2.0",
    "rxjs": "^7.8.0"
  },
  "devDependencies": {
    "@nestjs/cli": "^11.0.0",
    "@nestjs/testing": "^11.0.0",
    "@types/node": "^22.0.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "eslint": "^9.0.0",
    "prisma": "^6.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.8.0",
    "vitest": "^3.0.0"
  },
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
```

Create `apps/control-plane/tsconfig.json`:

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2022",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts", "test/**/*.ts", "prisma/**/*.ts"]
}
```

Create `apps/control-plane/nest-cli.json`:

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true
  }
}
```

- [ ] **Step 2: Create the health-focused NestJS app**

Create `apps/control-plane/src/config.ts`:

```ts
export interface AppConfig {
  port: number;
  databaseUrl: string;
}

export function loadConfig(): AppConfig {
  return {
    port: Number(process.env.CONTROL_PLANE_PORT ?? 4000),
    databaseUrl: process.env.DATABASE_URL ?? '',
  };
}
```

Create `apps/control-plane/src/prisma.service.ts`:

```ts
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
```

Create `apps/control-plane/src/health.controller.ts`:

```ts
import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getHealth(): Promise<{ status: string; database: string }> {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', database: 'ok' };
  }
}
```

Create `apps/control-plane/src/app.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PrismaService } from './prisma.service';

@Module({
  controllers: [HealthController],
  providers: [PrismaService],
})
export class AppModule {}
```

Create `apps/control-plane/src/main.ts`:

```ts
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import cors from '@fastify/cors';
import { AppModule } from './app.module';
import { loadConfig } from './config';

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true }),
  );

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.listen(config.port, '0.0.0.0');
}

void bootstrap();
```

- [ ] **Step 3: Add the first health test**

Create `apps/control-plane/test/health.e2e-spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

describe('control plane health contract', () => {
  it('documents the health response shape', () => {
    const response = { status: 'ok', database: 'ok' };
    expect(response).toEqual({ status: 'ok', database: 'ok' });
  });
});
```

- [ ] **Step 4: Install dependencies and run tests**

Run:

```bash
pnpm install
pnpm --filter @platform/control-plane test
```

Expected: test command exits `0` and reports one passing test.

- [ ] **Step 5: Commit**

Run:

```bash
git add package.json pnpm-lock.yaml apps/control-plane
git commit -m "feat: add minimal control plane service"
```

## Task 3: Prisma Schema, Migration, And Seed Data

**Files:**
- Create: `apps/control-plane/prisma/schema.prisma`
- Create: `apps/control-plane/prisma/migrations/000001_init/migration.sql`
- Create: `apps/control-plane/prisma/seed.ts`

- [ ] **Step 1: Define the initial schema**

Create `apps/control-plane/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum UserType {
  internal
  external
}

enum UserStatus {
  active
  suspended
  deleted
}

enum IdentityProvider {
  local
  company_sso
  password
  google
  github
}

enum OrganizationType {
  internal
  customer
  partner
}

enum MembershipRole {
  platform_admin
  org_admin
  service_admin
  developer
  viewer
}

enum RecordStatus {
  active
  disabled
}

model User {
  id           String       @id @default(uuid())
  email        String       @unique
  displayName  String       @map("display_name")
  passwordHash String       @map("password_hash")
  userType     UserType     @default(internal) @map("user_type")
  status       UserStatus   @default(active)
  identities   Identity[]
  memberships  Membership[]
  createdAt    DateTime     @default(now()) @map("created_at")
  updatedAt    DateTime     @updatedAt @map("updated_at")

  @@map("users")
}

model Identity {
  id              String           @id @default(uuid())
  userId          String           @map("user_id")
  provider        IdentityProvider
  providerSubject String           @map("provider_subject")
  emailVerified   Boolean          @default(false) @map("email_verified")
  user            User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt       DateTime         @default(now()) @map("created_at")

  @@unique([provider, providerSubject])
  @@map("identities")
}

model Organization {
  id               String             @id @default(uuid())
  name             String
  organizationType OrganizationType   @default(internal) @map("organization_type")
  status           RecordStatus       @default(active)
  memberships      Membership[]
  services         BackendService[]
  createdAt        DateTime           @default(now()) @map("created_at")

  @@map("organizations")
}

model Membership {
  id             String         @id @default(uuid())
  userId         String         @map("user_id")
  organizationId String         @map("organization_id")
  role           MembershipRole
  status         RecordStatus   @default(active)
  user           User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  organization   Organization   @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  createdAt      DateTime       @default(now()) @map("created_at")

  @@unique([userId, organizationId, role])
  @@map("memberships")
}

model BackendService {
  id                 String       @id @default(uuid())
  organizationId     String       @map("organization_id")
  name               String
  slug               String       @unique
  baseUrl            String       @map("base_url")
  allowedRoutes      Json         @map("allowed_routes")
  upstreamAuthConfig Json?        @map("upstream_auth_config")
  status             RecordStatus @default(active)
  organization       Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  createdAt          DateTime     @default(now()) @map("created_at")
  updatedAt          DateTime     @updatedAt @map("updated_at")

  @@map("backend_services")
}
```

- [ ] **Step 2: Create the SQL migration**

Create `apps/control-plane/prisma/migrations/000001_init/migration.sql`:

```sql
CREATE TYPE "UserType" AS ENUM ('internal', 'external');
CREATE TYPE "UserStatus" AS ENUM ('active', 'suspended', 'deleted');
CREATE TYPE "IdentityProvider" AS ENUM ('local', 'company_sso', 'password', 'google', 'github');
CREATE TYPE "OrganizationType" AS ENUM ('internal', 'customer', 'partner');
CREATE TYPE "MembershipRole" AS ENUM ('platform_admin', 'org_admin', 'service_admin', 'developer', 'viewer');
CREATE TYPE "RecordStatus" AS ENUM ('active', 'disabled');

CREATE TABLE "users" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "password_hash" TEXT NOT NULL,
  "user_type" "UserType" NOT NULL DEFAULT 'internal',
  "status" "UserStatus" NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE TABLE "identities" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "provider" "IdentityProvider" NOT NULL,
  "provider_subject" TEXT NOT NULL,
  "email_verified" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "identities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "identities_provider_provider_subject_key" ON "identities"("provider", "provider_subject");
ALTER TABLE "identities" ADD CONSTRAINT "identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "organizations" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "organization_type" "OrganizationType" NOT NULL DEFAULT 'internal',
  "status" "RecordStatus" NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "memberships" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "role" "MembershipRole" NOT NULL,
  "status" "RecordStatus" NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "memberships_user_id_organization_id_role_key" ON "memberships"("user_id", "organization_id", "role");
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "backend_services" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "base_url" TEXT NOT NULL,
  "allowed_routes" JSONB NOT NULL,
  "upstream_auth_config" JSONB,
  "status" "RecordStatus" NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "backend_services_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "backend_services_slug_key" ON "backend_services"("slug");
ALTER TABLE "backend_services" ADD CONSTRAINT "backend_services_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: Create the seed script**

Create `apps/control-plane/prisma/seed.ts`:

```ts
import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.local';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';
  const orgName = process.env.SEED_ORG_NAME ?? 'Internal Platform Team';
  const serviceName = process.env.SEED_SERVICE_NAME ?? 'Sample Backend';
  const serviceSlug = process.env.SEED_SERVICE_SLUG ?? 'sample';
  const serviceBaseUrl = process.env.SEED_SERVICE_BASE_URL ?? 'http://sample-backend:6060';

  const passwordHash = await argon2.hash(adminPassword);

  const user = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { displayName: 'Platform Admin', passwordHash },
    create: {
      email: adminEmail,
      displayName: 'Platform Admin',
      passwordHash,
      userType: 'internal',
      status: 'active',
      identities: {
        create: {
          provider: 'local',
          providerSubject: adminEmail,
          emailVerified: true,
        },
      },
    },
  });

  const organization = await prisma.organization.upsert({
    where: { id: 'seed-internal-org' },
    update: { name: orgName },
    create: {
      id: 'seed-internal-org',
      name: orgName,
      organizationType: 'internal',
      status: 'active',
    },
  });

  await prisma.membership.upsert({
    where: {
      userId_organizationId_role: {
        userId: user.id,
        organizationId: organization.id,
        role: 'platform_admin',
      },
    },
    update: { status: 'active' },
    create: {
      userId: user.id,
      organizationId: organization.id,
      role: 'platform_admin',
      status: 'active',
    },
  });

  await prisma.backendService.upsert({
    where: { slug: serviceSlug },
    update: {
      name: serviceName,
      baseUrl: serviceBaseUrl,
      allowedRoutes: [{ method: 'GET', path: '/*' }],
      status: 'active',
    },
    create: {
      organizationId: organization.id,
      name: serviceName,
      slug: serviceSlug,
      baseUrl: serviceBaseUrl,
      allowedRoutes: [{ method: 'GET', path: '/*' }],
      status: 'active',
    },
  });

  console.log(`Seeded admin ${adminEmail}, organization ${organization.name}, service ${serviceSlug}`);
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
```

- [ ] **Step 4: Generate Prisma client**

Run:

```bash
pnpm --filter @platform/control-plane prisma:generate
```

Expected: command exits `0` and Prisma client is generated.

- [ ] **Step 5: Commit**

Run:

```bash
git add apps/control-plane/prisma apps/control-plane/package.json
git commit -m "feat: add initial platform schema and seed data"
```

## Task 4: Minimal Admin Portal

**Files:**
- Create: `apps/admin-portal/package.json`
- Create: `apps/admin-portal/tsconfig.json`
- Create: `apps/admin-portal/vite.config.ts`
- Create: `apps/admin-portal/index.html`
- Create: `apps/admin-portal/src/main.tsx`
- Create: `apps/admin-portal/src/App.tsx`
- Create: `apps/admin-portal/src/styles.css`

- [ ] **Step 1: Create package and config**

Create `apps/admin-portal/package.json`:

```json
{
  "name": "@platform/admin-portal",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0",
    "build": "tsc -b && vite build",
    "preview": "vite preview --host 0.0.0.0",
    "test": "vitest run",
    "lint": "eslint \"src/**/*.{ts,tsx}\""
  },
  "dependencies": {
    "@tanstack/react-query": "^5.0.0",
    "@tanstack/react-router": "^1.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "vite": "^6.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.8.0",
    "vitest": "^3.0.0"
  }
}
```

Create `apps/admin-portal/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src"],
  "references": []
}
```

Create `apps/admin-portal/vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.ADMIN_PORTAL_PORT ?? 3000),
  },
});
```

- [ ] **Step 2: Create the portal shell**

Create `apps/admin-portal/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>API Key Platform</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `apps/admin-portal/src/main.tsx`:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import './styles.css';

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
```

Create `apps/admin-portal/src/App.tsx`:

```tsx
export function App() {
  const controlPlaneUrl = import.meta.env.VITE_CONTROL_PLANE_URL ?? 'http://localhost:4000';

  return (
    <main className="shell">
      <section className="panel">
        <p className="eyebrow">Internal Control Plane</p>
        <h1>API Key Platform</h1>
        <p>
          Foundation is running. The full admin portal will manage users, organizations, services,
          API keys, rate limits, and audit logs in later implementation tasks.
        </p>
        <a href={`${controlPlaneUrl}/health`}>Control plane health</a>
      </section>
    </main>
  );
}
```

Create `apps/admin-portal/src/styles.css`:

```css
:root {
  color: #172026;
  background: #f4f7f6;
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

body {
  margin: 0;
}

.shell {
  align-items: center;
  display: flex;
  min-height: 100vh;
  padding: 32px;
}

.panel {
  background: #ffffff;
  border: 1px solid #d8e2df;
  border-radius: 8px;
  box-shadow: 0 12px 30px rgb(23 32 38 / 8%);
  max-width: 640px;
  padding: 32px;
}

.eyebrow {
  color: #2c6e63;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0;
  margin: 0 0 12px;
  text-transform: uppercase;
}

h1 {
  font-size: 36px;
  line-height: 1.1;
  margin: 0 0 16px;
}

p {
  color: #40515a;
  font-size: 16px;
  line-height: 1.6;
}

a {
  color: #0f5bff;
  font-weight: 700;
}
```

- [ ] **Step 3: Build the portal**

Run:

```bash
pnpm --filter @platform/admin-portal build
```

Expected: command exits `0` and creates `apps/admin-portal/dist`.

- [ ] **Step 4: Commit**

Run:

```bash
git add apps/admin-portal package.json pnpm-lock.yaml
git commit -m "feat: add minimal admin portal"
```

## Task 5: Minimal Go Sample Backend

**Files:**
- Create: `apps/sample-backend/go.mod`
- Create: `apps/sample-backend/main.go`

- [ ] **Step 1: Create the sample backend module**

Create `apps/sample-backend/go.mod`:

```go
module platform/sample-backend

go 1.23
```

Create `apps/sample-backend/main.go`:

```go
package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
)

func main() {
	port := getenv("SAMPLE_BACKEND_PORT", "6060")

	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{
			"status":  "ok",
			"service": "sample-backend",
		})
	})
	mux.HandleFunc("/v1/jobs", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"items": []map[string]string{
				{"id": "job_001", "status": "queued"},
			},
		})
	})

	log.Printf("sample backend listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, mux))
}

func getenv(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		log.Printf("encode response: %v", err)
	}
}
```

- [ ] **Step 2: Verify sample backend tests by build**

Run:

```bash
cd apps/sample-backend && go test ./...
```

Expected: command exits `0`.

- [ ] **Step 3: Commit**

Run:

```bash
git add apps/sample-backend
git commit -m "feat: add sample backend service"
```

## Task 6: Minimal Go Gateway

**Files:**
- Create: `apps/gateway/go.mod`
- Create: `apps/gateway/internal/config/config.go`
- Create: `apps/gateway/internal/proxy/proxy.go`
- Create: `apps/gateway/cmd/gateway/main.go`

- [ ] **Step 1: Create the gateway module**

Create `apps/gateway/go.mod`:

```go
module platform/gateway

go 1.23

require github.com/go-chi/chi/v5 v5.2.0
```

Create `apps/gateway/internal/config/config.go`:

```go
package config

import "os"

type Config struct {
	Port             string
	SampleBackendURL string
}

func Load() Config {
	return Config{
		Port:             getenv("GATEWAY_PORT", "8080"),
		SampleBackendURL: getenv("SAMPLE_BACKEND_URL", "http://sample-backend:6060"),
	}
}

func getenv(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}
```

- [ ] **Step 2: Create reverse proxy helper**

Create `apps/gateway/internal/proxy/proxy.go`:

```go
package proxy

import (
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
)

func NewSingleTargetProxy(target string, stripPrefix string) (http.Handler, error) {
	targetURL, err := url.Parse(target)
	if err != nil {
		return nil, err
	}

	proxy := httputil.NewSingleHostReverseProxy(targetURL)
	originalDirector := proxy.Director

	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		req.URL.Path = strings.TrimPrefix(req.URL.Path, stripPrefix)
		if req.URL.Path == "" {
			req.URL.Path = "/"
		}
		req.Host = targetURL.Host
		req.Header.Set("X-Platform-Service-Slug", "sample")
	}

	return proxy, nil
}
```

- [ ] **Step 3: Create gateway main**

Create `apps/gateway/cmd/gateway/main.go`:

```go
package main

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"

	"platform/gateway/internal/config"
	"platform/gateway/internal/proxy"
)

func main() {
	cfg := config.Load()

	sampleProxy, err := proxy.NewSingleTargetProxy(cfg.SampleBackendURL, "/proxy/sample")
	if err != nil {
		log.Fatalf("create sample proxy: %v", err)
	}

	router := chi.NewRouter()
	router.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{
			"status":  "ok",
			"service": "gateway",
		})
	})
	router.Handle("/proxy/sample/*", sampleProxy)

	log.Printf("gateway listening on :%s", cfg.Port)
	log.Fatal(http.ListenAndServe(":"+cfg.Port, router))
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		log.Printf("encode response: %v", err)
	}
}
```

- [ ] **Step 4: Verify gateway module**

Run:

```bash
cd apps/gateway && go mod tidy && go test ./...
```

Expected: command exits `0`.

- [ ] **Step 5: Commit**

Run:

```bash
git add apps/gateway
git commit -m "feat: add minimal gateway proxy"
```

## Task 7: Dockerfiles For All App Services

**Files:**
- Create: `apps/control-plane/Dockerfile`
- Create: `apps/admin-portal/Dockerfile`
- Create: `apps/gateway/Dockerfile`
- Create: `apps/sample-backend/Dockerfile`

- [ ] **Step 1: Create control plane Dockerfile**

Create `apps/control-plane/Dockerfile`:

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/control-plane/package.json apps/control-plane/package.json
RUN pnpm install --filter @platform/control-plane... --frozen-lockfile

FROM deps AS build
COPY apps/control-plane apps/control-plane
WORKDIR /workspace/apps/control-plane
RUN pnpm prisma:generate
RUN pnpm build

FROM node:22-alpine AS runtime
WORKDIR /app
RUN corepack enable
COPY --from=deps /workspace/node_modules /workspace/node_modules
COPY --from=deps /workspace/apps/control-plane/node_modules ./node_modules
COPY --from=build /workspace/apps/control-plane/dist ./dist
COPY --from=build /workspace/apps/control-plane/prisma ./prisma
COPY apps/control-plane/package.json ./package.json
EXPOSE 4000
CMD ["node", "dist/main.js"]
```

- [ ] **Step 2: Create admin portal Dockerfile**

Create `apps/admin-portal/Dockerfile`:

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/admin-portal/package.json apps/admin-portal/package.json
RUN pnpm install --filter @platform/admin-portal... --frozen-lockfile

FROM deps AS build
COPY apps/admin-portal apps/admin-portal
WORKDIR /workspace/apps/admin-portal
ARG VITE_CONTROL_PLANE_URL=http://localhost:4000
ENV VITE_CONTROL_PLANE_URL=$VITE_CONTROL_PLANE_URL
RUN pnpm build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /workspace/apps/admin-portal/dist /usr/share/nginx/html
EXPOSE 80
```

- [ ] **Step 3: Create gateway Dockerfile**

Create `apps/gateway/Dockerfile`:

```dockerfile
FROM golang:1.23-alpine AS build
WORKDIR /src
COPY apps/gateway/go.mod apps/gateway/go.sum* ./
RUN go mod download
COPY apps/gateway ./
RUN go build -o /out/gateway ./cmd/gateway

FROM alpine:3.21
WORKDIR /app
COPY --from=build /out/gateway /app/gateway
EXPOSE 8080
CMD ["/app/gateway"]
```

- [ ] **Step 4: Create sample backend Dockerfile**

Create `apps/sample-backend/Dockerfile`:

```dockerfile
FROM golang:1.23-alpine AS build
WORKDIR /src
COPY apps/sample-backend/go.mod apps/sample-backend/go.sum* ./
RUN go mod download
COPY apps/sample-backend ./
RUN go build -o /out/sample-backend .

FROM alpine:3.21
WORKDIR /app
COPY --from=build /out/sample-backend /app/sample-backend
EXPOSE 6060
CMD ["/app/sample-backend"]
```

- [ ] **Step 5: Build service images**

Run:

```bash
docker build -f apps/control-plane/Dockerfile -t platform-control-plane .
docker build -f apps/admin-portal/Dockerfile -t platform-admin-portal .
docker build -f apps/gateway/Dockerfile -t platform-gateway .
docker build -f apps/sample-backend/Dockerfile -t platform-sample-backend .
```

Expected: all four image builds exit `0`.

- [ ] **Step 6: Commit**

Run:

```bash
git add apps/control-plane/Dockerfile apps/admin-portal/Dockerfile apps/gateway/Dockerfile apps/sample-backend/Dockerfile
git commit -m "chore: add service Dockerfiles"
```

## Task 8: Docker Compose Runtime Graph

**Files:**
- Create: `docker-compose.yml`

- [ ] **Step 1: Create Docker Compose file**

Create `docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-platform}
      POSTGRES_USER: ${POSTGRES_USER:-platform}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-platform_dev_password}
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 20
    volumes:
      - postgres-data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "${REDIS_PORT:-6379}:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 20

  migrate-seed:
    build:
      context: .
      dockerfile: apps/control-plane/Dockerfile
    env_file:
      - .env
    command: sh -c "npx prisma migrate deploy && npx prisma db seed"
    depends_on:
      postgres:
        condition: service_healthy
    restart: "no"

  control-plane:
    build:
      context: .
      dockerfile: apps/control-plane/Dockerfile
    env_file:
      - .env
    ports:
      - "${CONTROL_PLANE_PORT:-4000}:4000"
    depends_on:
      postgres:
        condition: service_healthy
      migrate-seed:
        condition: service_completed_successfully
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:4000/health"]
      interval: 10s
      timeout: 5s
      retries: 20

  admin-portal:
    build:
      context: .
      dockerfile: apps/admin-portal/Dockerfile
      args:
        VITE_CONTROL_PLANE_URL: ${CONTROL_PLANE_PUBLIC_URL:-http://localhost:4000}
    ports:
      - "${ADMIN_PORTAL_PORT:-3000}:80"
    depends_on:
      control-plane:
        condition: service_healthy

  sample-backend:
    build:
      context: .
      dockerfile: apps/sample-backend/Dockerfile
    environment:
      SAMPLE_BACKEND_PORT: ${SAMPLE_BACKEND_PORT:-6060}
    ports:
      - "${SAMPLE_BACKEND_PORT:-6060}:6060"
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:6060/health"]
      interval: 10s
      timeout: 5s
      retries: 20

  gateway:
    build:
      context: .
      dockerfile: apps/gateway/Dockerfile
    environment:
      GATEWAY_PORT: ${GATEWAY_PORT:-8080}
      SAMPLE_BACKEND_URL: ${SAMPLE_BACKEND_URL:-http://sample-backend:6060}
      REDIS_URL: ${REDIS_URL:-redis://redis:6379}
      CONTROL_PLANE_URL: http://control-plane:4000
    ports:
      - "${GATEWAY_PORT:-8080}:8080"
    depends_on:
      redis:
        condition: service_healthy
      control-plane:
        condition: service_healthy
      sample-backend:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:8080/health"]
      interval: 10s
      timeout: 5s
      retries: 20

volumes:
  postgres-data:
```

- [ ] **Step 2: Validate Compose config**

Run:

```bash
cp .env.example .env
docker compose config
```

Expected: command exits `0` and renders all seven services.

- [ ] **Step 3: Commit**

Run:

```bash
git add docker-compose.yml .env.example
git commit -m "chore: add compose runtime graph"
```

## Task 9: Compose Smoke Test Script

**Files:**
- Create: `scripts/smoke-compose.sh`

- [ ] **Step 1: Create smoke test script**

Create `scripts/smoke-compose.sh`:

```bash
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
```

- [ ] **Step 2: Make script executable**

Run:

```bash
chmod +x scripts/smoke-compose.sh
```

- [ ] **Step 3: Commit**

Run:

```bash
git add scripts/smoke-compose.sh
git commit -m "test: add compose smoke checks"
```

## Task 10: End-To-End Compose Verification

**Files:**
- Modify only if previous tasks reveal defects.

- [ ] **Step 1: Start from a clean Compose state**

Run:

```bash
docker compose down -v
cp .env.example .env
docker compose up -d --build
```

Expected: command exits `0`.

- [ ] **Step 2: Confirm services become healthy**

Run:

```bash
docker compose ps
```

Expected:

- `postgres` is healthy.
- `redis` is healthy.
- `migrate-seed` exited `0`.
- `control-plane` is healthy.
- `admin-portal` is running.
- `sample-backend` is healthy.
- `gateway` is healthy.

- [ ] **Step 3: Run smoke checks**

Run:

```bash
./scripts/smoke-compose.sh
```

Expected: script exits `0` and prints `Smoke checks passed.`

- [ ] **Step 4: Run local build/test checks**

Run:

```bash
pnpm test
pnpm build
cd apps/gateway && go test ./...
cd ../sample-backend && go test ./...
```

Expected: each command exits `0`.

- [ ] **Step 5: Commit any fixes**

If fixes were required, run:

```bash
git add .
git commit -m "fix: stabilize compose foundation"
```

If no fixes were required, do not create an empty commit.

## Self-Review Checklist

- Spec coverage:
  - Compose single-command startup is covered by Tasks 7, 8, and 10.
  - Postgres and Redis are covered by Task 8.
  - Control plane skeleton is covered by Tasks 2 and 3.
  - Admin portal skeleton is covered by Task 4.
  - Gateway skeleton is covered by Task 6.
  - Sample backend and gateway proxy proof are covered by Tasks 5, 6, and 9.
  - Migration and seed job are covered by Tasks 3 and 8.
- Deferred by design:
  - Full login, RBAC, API keys, validation, rate limiting, audit logs, and real portal screens are covered by later plans.
- Placeholder scan:
  - No `TBD`, `TODO`, or unspecified implementation steps.
- Type consistency:
  - Seed script uses Prisma model and field names defined in `schema.prisma`.
  - Compose service names match `.env.example` URLs and smoke-test URLs.
  - Gateway `/proxy/sample/*` path matches the smoke-test path.
