CREATE TABLE "InventoryItem" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "article_number" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "unit" TEXT NOT NULL DEFAULT 'st',
  "default_unit_cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "supplier" TEXT,
  "supplier_article_number" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryStock" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "inventory_item_id" TEXT NOT NULL,
  "location" TEXT NOT NULL DEFAULT 'Huvudlager',
  "quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "reserved_quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryStock_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryTransaction" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "inventory_item_id" TEXT NOT NULL,
  "inventory_stock_id" TEXT,
  "work_order_id" TEXT,
  "execution_entry_id" TEXT,
  "actor_user_id" TEXT NOT NULL,
  "transaction_type" TEXT NOT NULL,
  "quantity" DECIMAL(14,3) NOT NULL,
  "unit_cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryTransaction_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WorkOrderExecutionEntry"
  ADD COLUMN "inventory_item_id" TEXT,
  ADD COLUMN "inventory_transaction_id" TEXT,
  ADD COLUMN "approval_status" TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN "approved_by_id" TEXT,
  ADD COLUMN "approved_at" TIMESTAMP(3),
  ADD COLUMN "approval_comment" TEXT,
  ADD COLUMN "voided_at" TIMESTAMP(3),
  ADD COLUMN "voided_by_id" TEXT,
  ADD COLUMN "void_reason" TEXT;

CREATE UNIQUE INDEX "InventoryItem_company_article_key" ON "InventoryItem"("company_id", "article_number");
CREATE INDEX "InventoryItem_company_active_idx" ON "InventoryItem"("company_id", "active");
CREATE UNIQUE INDEX "InventoryStock_item_location_key" ON "InventoryStock"("inventory_item_id", "location");
CREATE INDEX "InventoryStock_company_idx" ON "InventoryStock"("company_id");
CREATE INDEX "InventoryTransaction_item_created_idx" ON "InventoryTransaction"("inventory_item_id", "created_at");
CREATE INDEX "InventoryTransaction_work_order_idx" ON "InventoryTransaction"("work_order_id", "created_at");
CREATE INDEX "WorkOrderExecutionEntry_approval_idx" ON "WorkOrderExecutionEntry"("company_id", "approval_status");
CREATE INDEX "WorkOrderExecutionEntry_inventory_item_idx" ON "WorkOrderExecutionEntry"("inventory_item_id");

ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryStock" ADD CONSTRAINT "InventoryStock_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryStock" ADD CONSTRAINT "InventoryStock_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_inventory_stock_id_fkey" FOREIGN KEY ("inventory_stock_id") REFERENCES "InventoryStock"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkOrderExecutionEntry" ADD CONSTRAINT "WorkOrderExecutionEntry_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkOrderExecutionEntry" ADD CONSTRAINT "WorkOrderExecutionEntry_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkOrderExecutionEntry" ADD CONSTRAINT "WorkOrderExecutionEntry_voided_by_id_fkey" FOREIGN KEY ("voided_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_default_cost_check" CHECK ("default_unit_cost" >= 0);
ALTER TABLE "InventoryStock" ADD CONSTRAINT "InventoryStock_quantity_check" CHECK ("quantity" >= 0 AND "reserved_quantity" >= 0 AND "reserved_quantity" <= "quantity");
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_type_check" CHECK ("transaction_type" IN ('receipt', 'issue', 'return', 'adjustment'));
ALTER TABLE "WorkOrderExecutionEntry" ADD CONSTRAINT "WorkOrderExecutionEntry_approval_check" CHECK ("approval_status" IN ('pending', 'approved', 'rejected'));
