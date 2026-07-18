CREATE TABLE IF NOT EXISTS "WorkOrderEditLock" (
  "work_order_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "acquired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkOrderEditLock_pkey" PRIMARY KEY ("work_order_id"),
  CONSTRAINT "WorkOrderEditLock_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkOrderEditLock_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkOrderEditLock_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "WorkOrderEditLock_company_id_expires_at_idx"
  ON "WorkOrderEditLock"("company_id", "expires_at");

CREATE INDEX IF NOT EXISTS "WorkOrderEditLock_user_id_idx"
  ON "WorkOrderEditLock"("user_id");
