ALTER TABLE "ComplianceInspection" ADD COLUMN "work_order_id" TEXT;

CREATE UNIQUE INDEX "ComplianceInspection_work_order_id_key" ON "ComplianceInspection"("work_order_id");

ALTER TABLE "ComplianceInspection" ADD CONSTRAINT "ComplianceInspection_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
