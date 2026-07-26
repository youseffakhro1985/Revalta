-- TicketComment author fields for public portal / staff comments
ALTER TABLE "TicketComment" ADD COLUMN "author_type" TEXT NOT NULL DEFAULT 'staff';
ALTER TABLE "TicketComment" ADD COLUMN "author_name" TEXT;
ALTER TABLE "TicketComment" ADD COLUMN "author_email" TEXT;

-- Ticket soft-delete
ALTER TABLE "Ticket" ADD COLUMN "deleted_at" TIMESTAMP(3);
CREATE INDEX "Ticket_company_id_deleted_at_idx" ON "Ticket"("company_id", "deleted_at");
