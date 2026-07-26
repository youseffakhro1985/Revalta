-- Property soft-delete
ALTER TABLE "Property" ADD COLUMN "deleted_at" TIMESTAMP(3);
CREATE INDEX "Property_company_id_deleted_at_idx" ON "Property"("company_id", "deleted_at");
