CREATE TABLE "IntegrationWebhookEvent" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "external_event_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "signature_valid" BOOLEAN NOT NULL DEFAULT false,
  "payload_hash" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'received',
  "invoice_draft_id" TEXT,
  "processed_at" TIMESTAMP(3),
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IntegrationWebhookEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WorkOrderInvoiceDraft"
  ADD COLUMN "last_reconciled_at" TIMESTAMP(3),
  ADD COLUMN "last_external_status" TEXT,
  ADD COLUMN "payment_reference" TEXT;

CREATE UNIQUE INDEX "IntegrationWebhookEvent_provider_external_key" ON "IntegrationWebhookEvent"("provider", "external_event_id");
CREATE INDEX "IntegrationWebhookEvent_status_created_idx" ON "IntegrationWebhookEvent"("status", "created_at");
CREATE INDEX "IntegrationWebhookEvent_invoice_idx" ON "IntegrationWebhookEvent"("invoice_draft_id");

ALTER TABLE "IntegrationWebhookEvent" ADD CONSTRAINT "IntegrationWebhookEvent_invoice_draft_id_fkey" FOREIGN KEY ("invoice_draft_id") REFERENCES "WorkOrderInvoiceDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IntegrationWebhookEvent" ADD CONSTRAINT "IntegrationWebhookEvent_status_check" CHECK ("status" IN ('received', 'processed', 'ignored', 'failed'));
ALTER TABLE "IntegrationWebhookEvent" ADD CONSTRAINT "IntegrationWebhookEvent_provider_check" CHECK ("provider" IN ('fortnox', 'visma', 'generic'));
