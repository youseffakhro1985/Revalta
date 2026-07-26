-- Soft-delete modern TicketOperation rows
ALTER TABLE "TicketOperation" ADD COLUMN "deleted_at" TIMESTAMP(3);
CREATE INDEX "TicketOperation_company_id_deleted_at_idx" ON "TicketOperation"("company_id", "deleted_at");
