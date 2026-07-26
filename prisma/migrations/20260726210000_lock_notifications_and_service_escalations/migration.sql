CREATE TABLE "WorkOrderLockNotification" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "work_order_id" TEXT NOT NULL,
    "recipient_user_id" TEXT NOT NULL,
    "notification_key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "high" BOOLEAN NOT NULL DEFAULT true,
    "work_order_number" TEXT,
    "work_order_title" TEXT,
    "released_by_id" TEXT NOT NULL,
    "released_by_name" TEXT,
    "reason" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkOrderLockNotification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ServiceAssignmentEscalation" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "notification_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "reason" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ServiceAssignmentEscalation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ServiceEscalationAdminAction" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "requested_by_id" TEXT NOT NULL,
    "requested_by_email" TEXT NOT NULL,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ServiceEscalationAdminAction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkOrderLockNotification_company_id_notification_key_key" ON "WorkOrderLockNotification"("company_id", "notification_key");
CREATE INDEX "WorkOrderLockNotification_company_id_recipient_user_id_created_at_idx" ON "WorkOrderLockNotification"("company_id", "recipient_user_id", "created_at");
CREATE INDEX "WorkOrderLockNotification_work_order_id_idx" ON "WorkOrderLockNotification"("work_order_id");
CREATE INDEX "WorkOrderLockNotification_recipient_user_id_idx" ON "WorkOrderLockNotification"("recipient_user_id");
CREATE INDEX "WorkOrderLockNotification_released_by_id_idx" ON "WorkOrderLockNotification"("released_by_id");
CREATE UNIQUE INDEX "ServiceAssignmentEscalation_company_id_dedupe_key_key" ON "ServiceAssignmentEscalation"("company_id", "dedupe_key");
CREATE INDEX "ServiceAssignmentEscalation_company_id_status_created_at_idx" ON "ServiceAssignmentEscalation"("company_id", "status", "created_at");
CREATE INDEX "ServiceAssignmentEscalation_company_id_notification_key_idx" ON "ServiceAssignmentEscalation"("company_id", "notification_key");
CREATE INDEX "ServiceEscalationAdminAction_company_id_created_at_idx" ON "ServiceEscalationAdminAction"("company_id", "created_at");
CREATE INDEX "ServiceEscalationAdminAction_requested_by_id_idx" ON "ServiceEscalationAdminAction"("requested_by_id");

ALTER TABLE "WorkOrderLockNotification" ADD CONSTRAINT "WorkOrderLockNotification_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrderLockNotification" ADD CONSTRAINT "WorkOrderLockNotification_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrderLockNotification" ADD CONSTRAINT "WorkOrderLockNotification_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrderLockNotification" ADD CONSTRAINT "WorkOrderLockNotification_released_by_id_fkey" FOREIGN KEY ("released_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceAssignmentEscalation" ADD CONSTRAINT "ServiceAssignmentEscalation_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceEscalationAdminAction" ADD CONSTRAINT "ServiceEscalationAdminAction_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceEscalationAdminAction" ADD CONSTRAINT "ServiceEscalationAdminAction_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
