CREATE TABLE "ServiceNotificationAssignment" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "notification_key" TEXT NOT NULL,
    "asset_id" TEXT,
    "assignee_user_id" TEXT,
    "assignee_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'assigned',
    "deadline_at" TIMESTAMP(3),
    "note" TEXT,
    "changed_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ServiceNotificationAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComponentServiceDigestRun" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "payload" JSONB,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ComponentServiceDigestRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComponentServiceDeliveryAlert" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "source_run_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "severity" TEXT NOT NULL DEFAULT 'warning',
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "dedupe_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    CONSTRAINT "ComponentServiceDeliveryAlert_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComponentServiceDeliveryAlertAck" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "alert_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ComponentServiceDeliveryAlertAck_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ServiceNotificationAssignment_company_id_notification_key_key" ON "ServiceNotificationAssignment"("company_id", "notification_key");
CREATE INDEX "ServiceNotificationAssignment_company_id_status_deadline_at_idx" ON "ServiceNotificationAssignment"("company_id", "status", "deadline_at");
CREATE INDEX "ServiceNotificationAssignment_assignee_user_id_idx" ON "ServiceNotificationAssignment"("assignee_user_id");
CREATE INDEX "ServiceNotificationAssignment_changed_by_id_idx" ON "ServiceNotificationAssignment"("changed_by_id");

CREATE UNIQUE INDEX "ComponentServiceDigestRun_company_id_dedupe_key_key" ON "ComponentServiceDigestRun"("company_id", "dedupe_key");
CREATE INDEX "ComponentServiceDigestRun_company_id_status_created_at_idx" ON "ComponentServiceDigestRun"("company_id", "status", "created_at");

CREATE INDEX "ComponentServiceDeliveryAlert_company_id_status_created_at_idx" ON "ComponentServiceDeliveryAlert"("company_id", "status", "created_at");
CREATE INDEX "ComponentServiceDeliveryAlert_source_run_id_idx" ON "ComponentServiceDeliveryAlert"("source_run_id");

CREATE UNIQUE INDEX "ComponentServiceDeliveryAlertAck_alert_id_user_id_key" ON "ComponentServiceDeliveryAlertAck"("alert_id", "user_id");
CREATE INDEX "ComponentServiceDeliveryAlertAck_company_id_user_id_idx" ON "ComponentServiceDeliveryAlertAck"("company_id", "user_id");

ALTER TABLE "ServiceNotificationAssignment" ADD CONSTRAINT "ServiceNotificationAssignment_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceNotificationAssignment" ADD CONSTRAINT "ServiceNotificationAssignment_assignee_user_id_fkey" FOREIGN KEY ("assignee_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ServiceNotificationAssignment" ADD CONSTRAINT "ServiceNotificationAssignment_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ComponentServiceDigestRun" ADD CONSTRAINT "ComponentServiceDigestRun_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ComponentServiceDeliveryAlert" ADD CONSTRAINT "ComponentServiceDeliveryAlert_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComponentServiceDeliveryAlert" ADD CONSTRAINT "ComponentServiceDeliveryAlert_source_run_id_fkey" FOREIGN KEY ("source_run_id") REFERENCES "ComponentServiceDigestRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ComponentServiceDeliveryAlertAck" ADD CONSTRAINT "ComponentServiceDeliveryAlertAck_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComponentServiceDeliveryAlertAck" ADD CONSTRAINT "ComponentServiceDeliveryAlertAck_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "ComponentServiceDeliveryAlert"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComponentServiceDeliveryAlertAck" ADD CONSTRAINT "ComponentServiceDeliveryAlertAck_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
