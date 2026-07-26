-- AlterTable
ALTER TABLE "AppNotification" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "AppNotification_company_id_deleted_at_idx" ON "AppNotification"("company_id", "deleted_at");
