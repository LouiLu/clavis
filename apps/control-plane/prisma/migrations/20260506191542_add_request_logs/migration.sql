-- CreateTable
CREATE TABLE "request_logs" (
    "id" TEXT NOT NULL,
    "api_key_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "service_slug" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status_code" INTEGER NOT NULL,
    "latency_ms" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "request_logs_organization_id_idx" ON "request_logs"("organization_id");

-- CreateIndex
CREATE INDEX "request_logs_service_id_timestamp_idx" ON "request_logs"("service_id", "timestamp");

-- CreateIndex
CREATE INDEX "request_logs_api_key_id_timestamp_idx" ON "request_logs"("api_key_id", "timestamp");

-- CreateIndex
CREATE INDEX "request_logs_timestamp_idx" ON "request_logs"("timestamp");
