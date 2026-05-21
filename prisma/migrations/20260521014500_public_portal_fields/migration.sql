-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN "public_reference" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'internal';
ALTER TABLE "Ticket" ADD COLUMN "reporter_name" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "reporter_email" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "reporter_phone" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "reporter_unit" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_public_reference_key" ON "Ticket"("public_reference");
