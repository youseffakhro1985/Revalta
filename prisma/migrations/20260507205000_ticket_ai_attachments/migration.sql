-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN "ai_summary" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "ai_recommended_action" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "ai_confidence" DOUBLE PRECISION;
ALTER TABLE "Ticket" ADD COLUMN "ai_processed_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TicketAttachment" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "data_url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketAttachment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "TicketAttachment" ADD CONSTRAINT "TicketAttachment_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
