ALTER TABLE "WorkOrder" ADD COLUMN "deleted_at" TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN "deleted_at" TIMESTAMP(3);
ALTER TABLE "OperationalDocument" ADD COLUMN "deleted_at" TIMESTAMP(3);
ALTER TABLE "LeaseHolder" ADD COLUMN "deleted_at" TIMESTAMP(3);

CREATE INDEX "WorkOrder_company_id_deleted_at_idx" ON "WorkOrder"("company_id", "deleted_at");
CREATE INDEX "Project_company_id_deleted_at_idx" ON "Project"("company_id", "deleted_at");
CREATE INDEX "OperationalDocument_company_id_deleted_at_idx" ON "OperationalDocument"("company_id", "deleted_at");
CREATE INDEX "LeaseHolder_company_id_deleted_at_idx" ON "LeaseHolder"("company_id", "deleted_at");

CREATE TABLE "ServiceNotificationSettings" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "days_ahead" INTEGER NOT NULL DEFAULT 30,
    "roles" JSONB NOT NULL,
    "additional_emails" JSONB NOT NULL,
    "updated_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ServiceNotificationSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ServiceNotificationSettings_company_id_key" ON "ServiceNotificationSettings"("company_id");
CREATE INDEX "ServiceNotificationSettings_updated_by_id_idx" ON "ServiceNotificationSettings"("updated_by_id");

ALTER TABLE "ServiceNotificationSettings" ADD CONSTRAINT "ServiceNotificationSettings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceNotificationSettings" ADD CONSTRAINT "ServiceNotificationSettings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "UserServiceNotificationPreference" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "overdue_only" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserServiceNotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserServiceNotificationPreference_company_id_user_id_key" ON "UserServiceNotificationPreference"("company_id", "user_id");
CREATE INDEX "UserServiceNotificationPreference_user_id_idx" ON "UserServiceNotificationPreference"("user_id");

ALTER TABLE "UserServiceNotificationPreference" ADD CONSTRAINT "UserServiceNotificationPreference_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserServiceNotificationPreference" ADD CONSTRAINT "UserServiceNotificationPreference_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
