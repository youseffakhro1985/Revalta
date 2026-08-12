-- Additive indexes for session revocation, tenant-scoped audit queries,
-- integration processing, invite lifecycle, and attachment ownership checks.
CREATE INDEX IF NOT EXISTS "User_company_id_status_idx" ON "User"("company_id", "status");
CREATE INDEX IF NOT EXISTS "TicketAttachment_ticket_id_created_at_idx" ON "TicketAttachment"("ticket_id", "created_at");
CREATE INDEX IF NOT EXISTS "AuditLog_company_id_created_at_idx" ON "AuditLog"("company_id", "created_at");
CREATE INDEX IF NOT EXISTS "AuditLog_company_id_entity_type_entity_id_created_at_idx" ON "AuditLog"("company_id", "entity_type", "entity_id", "created_at");
CREATE INDEX IF NOT EXISTS "AuditLog_actor_user_id_entity_type_entity_id_action_created_at_idx" ON "AuditLog"("actor_user_id", "entity_type", "entity_id", "action", "created_at");
CREATE INDEX IF NOT EXISTS "IntegrationEvent_company_id_type_created_at_idx" ON "IntegrationEvent"("company_id", "type", "created_at");
CREATE INDEX IF NOT EXISTS "IntegrationEvent_company_id_status_created_at_idx" ON "IntegrationEvent"("company_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "PasswordResetToken_user_id_used_at_idx" ON "PasswordResetToken"("user_id", "used_at");
CREATE INDEX IF NOT EXISTS "EmailVerificationToken_user_id_used_at_idx" ON "EmailVerificationToken"("user_id", "used_at");
CREATE INDEX IF NOT EXISTS "TeamInvite_company_id_email_accepted_at_idx" ON "TeamInvite"("company_id", "email", "accepted_at");
CREATE INDEX IF NOT EXISTS "TeamInvite_expires_at_idx" ON "TeamInvite"("expires_at");

CREATE TABLE IF NOT EXISTS "WebhookReceipt" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'processing',
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMP(3),
  CONSTRAINT "WebhookReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WebhookReceipt_provider_event_id_key"
  ON "WebhookReceipt"("provider", "event_id");
CREATE INDEX IF NOT EXISTS "WebhookReceipt_provider_status_received_at_idx"
  ON "WebhookReceipt"("provider", "status", "received_at");
