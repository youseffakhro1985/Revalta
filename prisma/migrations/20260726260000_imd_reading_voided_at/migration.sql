-- Soft-void IMD readings that are not yet attached to a rent notice
ALTER TABLE "ImdReading" ADD COLUMN "voided_at" TIMESTAMP(3);
CREATE INDEX "ImdReading_company_id_voided_at_idx" ON "ImdReading"("company_id", "voided_at");
