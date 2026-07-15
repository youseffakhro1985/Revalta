CREATE TABLE "AccountingSyncJob" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "invoice_draft_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "operation" TEXT NOT NULL DEFAULT 'create_invoice',
  "status" TEXT NOT NULL DEFAULT 'queued',
  "idempotency_key" TEXT NOT NULL,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 5,
  "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "locked_at" TIMESTAMP(3),
  "locked_by" TEXT,
  "last_error_code" TEXT,
  "last_error_message" TEXT,
  "external_reference" TEXT,
  "payload_snapshot" JSONB NOT NULL,
  "response_snapshot" JSONB,
  "created_by_id" TEXT NOT NULL,
  "completed_at" TIMESTAMP(3),
  "cancelled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountingSyncJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountingSyncAttempt" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "sync_job_id" TEXT NOT NULL,
  "attempt_number" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "request_snapshot" JSONB,
  "response_snapshot" JSONB,
  "error_code" TEXT,
  "error_message" TEXT,
  "duration_ms" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountingSyncAttempt_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WorkOrderInvoiceDraft"
  ADD COLUMN "accounting_provider" TEXT,
  ADD COLUMN "sync_status" TEXT NOT NULL DEFAULT 'not_queued',
  ADD COLUMN "sync_job_id" TEXT,
  ADD COLUMN "last_synced_at" TIMESTAMP(3),
  ADD COLUMN "last_sync_error" TEXT;

CREATE UNIQUE INDEX "AccountingSyncJob_idempotency_key" ON "AccountingSyncJob"("idempotency_key");
CREATE INDEX "AccountingSyncJob_queue_idx" ON "AccountingSyncJob"("status", "next_attempt_at");
CREATE INDEX "AccountingSyncJob_company_created_idx" ON "AccountingSyncJob"("company_id", "created_at");
CREATE INDEX "AccountingSyncAttempt_job_created_idx" ON "AccountingSyncAttempt"("sync_job_id", "created_at");
CREATE UNIQUE INDEX "AccountingSyncAttempt_job_attempt_key" ON "AccountingSyncAttempt"("sync_job_id", "attempt_number");
CREATE INDEX "WorkOrderInvoiceDraft_sync_idx" ON "WorkOrderInvoiceDraft"("company_id", "sync_status");

ALTER TABLE "AccountingSyncJob" ADD CONSTRAINT "AccountingSyncJob_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingSyncJob" ADD CONSTRAINT "AccountingSyncJob_invoice_draft_id_fkey" FOREIGN KEY ("invoice_draft_id") REFERENCES "WorkOrderInvoiceDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingSyncJob" ADD CONSTRAINT "AccountingSyncJob_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountingSyncAttempt" ADD CONSTRAINT "AccountingSyncAttempt_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingSyncAttempt" ADD CONSTRAINT "AccountingSyncAttempt_sync_job_id_fkey" FOREIGN KEY ("sync_job_id") REFERENCES "AccountingSyncJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrderInvoiceDraft" ADD CONSTRAINT "WorkOrderInvoiceDraft_sync_job_id_fkey" FOREIGN KEY ("sync_job_id") REFERENCES "AccountingSyncJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AccountingSyncJob" ADD CONSTRAINT "AccountingSyncJob_provider_check" CHECK ("provider" IN ('fortnox', 'visma', 'generic'));
ALTER TABLE "AccountingSyncJob" ADD CONSTRAINT "AccountingSyncJob_operation_check" CHECK ("operation" IN ('create_invoice', 'update_invoice', 'register_payment', 'cancel_invoice'));
ALTER TABLE "AccountingSyncJob" ADD CONSTRAINT "AccountingSyncJob_status_check" CHECK ("status" IN ('queued', 'processing', 'retrying', 'completed', 'failed', 'cancelled'));
ALTER TABLE "AccountingSyncAttempt" ADD CONSTRAINT "AccountingSyncAttempt_status_check" CHECK ("status" IN ('started', 'completed', 'failed'));
ALTER TABLE "WorkOrderInvoiceDraft" ADD CONSTRAINT "WorkOrderInvoiceDraft_sync_status_check" CHECK ("sync_status" IN ('not_queued', 'queued', 'processing', 'synced', 'failed', 'cancelled'));
ALTER TABLE "AccountingSyncJob" ADD CONSTRAINT "AccountingSyncJob_attempts_check" CHECK ("attempt_count" >= 0 AND "max_attempts" BETWEEN 1 AND 20);
