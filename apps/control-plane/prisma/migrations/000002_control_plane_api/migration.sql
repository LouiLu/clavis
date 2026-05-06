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
