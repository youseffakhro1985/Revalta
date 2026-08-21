-- CreateTable
CREATE TABLE "InspectionChecklistTemplate" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "description" TEXT,
    "items" JSONB NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InspectionChecklistTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InspectionChecklistTemplate_company_id_updated_at_idx" ON "InspectionChecklistTemplate"("company_id", "updated_at");
CREATE INDEX "InspectionChecklistTemplate_company_id_category_idx" ON "InspectionChecklistTemplate"("company_id", "category");
CREATE INDEX "InspectionChecklistTemplate_created_by_id_idx" ON "InspectionChecklistTemplate"("created_by_id");

-- AddForeignKey
ALTER TABLE "InspectionChecklistTemplate" ADD CONSTRAINT "InspectionChecklistTemplate_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InspectionChecklistTemplate" ADD CONSTRAINT "InspectionChecklistTemplate_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
