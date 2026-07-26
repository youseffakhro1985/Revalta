-- Lease soft-delete
ALTER TABLE "Lease" ADD COLUMN "deleted_at" TIMESTAMP(3);
CREATE INDEX "Lease_company_id_deleted_at_idx" ON "Lease"("company_id", "deleted_at");
