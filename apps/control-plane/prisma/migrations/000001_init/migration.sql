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
