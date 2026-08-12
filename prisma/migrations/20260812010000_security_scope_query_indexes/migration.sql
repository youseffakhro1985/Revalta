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
