ALTER TABLE "WorkOrder"
  ADD COLUMN "work_order_number" TEXT,
  ADD COLUMN "building_id" TEXT,
  ADD COLUMN "entrance_id" TEXT,
  ADD COLUMN "technical_asset_id" TEXT,
  ADD COLUMN "work_type" TEXT NOT NULL DEFAULT 'corrective',
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'internal',
  ADD COLUMN "sla_response_due_at" TIMESTAMP(3),
  ADD COLUMN "sla_resolution_due_at" TIMESTAMP(3),
  ADD COLUMN "responded_at" TIMESTAMP(3),
  ADD COLUMN "paused_at" TIMESTAMP(3),
  ADD COLUMN "pause_reason" TEXT,
  ADD COLUMN "closed_at" TIMESTAMP(3),
  ADD COLUMN "billable" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "requires_inspection" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "WorkOrderNumberCounter" (
  "company_id" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "last_number" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkOrderNumberCounter_pkey" PRIMARY KEY ("company_id", "year")
);

CREATE TABLE "WorkOrderStatusEvent" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "work_order_id" TEXT NOT NULL,
  "actor_user_id" TEXT NOT NULL,
  "from_status" TEXT,
  "to_status" TEXT NOT NULL,
  "reason" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkOrderStatusEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkOrder_company_number_key" ON "WorkOrder"("company_id", "work_order_number");
CREATE INDEX "WorkOrder_company_sla_resolution_idx" ON "WorkOrder"("company_id", "sla_resolution_due_at");
CREATE INDEX "WorkOrder_building_id_idx" ON "WorkOrder"("building_id");
CREATE INDEX "WorkOrder_technical_asset_id_idx" ON "WorkOrder"("technical_asset_id");
CREATE INDEX "WorkOrderStatusEvent_work_order_created_idx" ON "WorkOrderStatusEvent"("work_order_id", "created_at");
CREATE INDEX "WorkOrderStatusEvent_company_created_idx" ON "WorkOrderStatusEvent"("company_id", "created_at");

ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "Building"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_technical_asset_id_fkey" FOREIGN KEY ("technical_asset_id") REFERENCES "PropertyTechnicalAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkOrderNumberCounter" ADD CONSTRAINT "WorkOrderNumberCounter_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrderStatusEvent" ADD CONSTRAINT "WorkOrderStatusEvent_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrderStatusEvent" ADD CONSTRAINT "WorkOrderStatusEvent_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrderStatusEvent" ADD CONSTRAINT "WorkOrderStatusEvent_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_work_type_check" CHECK ("work_type" IN ('corrective', 'preventive', 'inspection', 'emergency', 'project', 'warranty'));
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_source_check" CHECK ("source" IN ('internal', 'ticket', 'maintenance_plan', 'inspection', 'component', 'resident', 'supplier'));
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_enterprise_status_check" CHECK ("status" IN ('new', 'planned', 'assigned', 'in_progress', 'waiting_material', 'waiting_resident', 'inspection', 'completed', 'invoiced', 'closed', 'cancelled'));
ALTER TABLE "WorkOrderStatusEvent" ADD CONSTRAINT "WorkOrderStatusEvent_to_status_check" CHECK ("to_status" IN ('new', 'planned', 'assigned', 'in_progress', 'waiting_material', 'waiting_resident', 'inspection', 'completed', 'invoiced', 'closed', 'cancelled'));
