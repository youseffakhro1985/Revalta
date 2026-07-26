CREATE TABLE "NotificationUxState" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "notification_key" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "snoozed_until" TIMESTAMP(3),
    "snooze_cleared_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NotificationUxState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ServiceEscalationRulesSettings" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "escalate_blocked" BOOLEAN NOT NULL DEFAULT true,
    "escalate_overdue" BOOLEAN NOT NULL DEFAULT true,
    "grace_days" INTEGER NOT NULL DEFAULT 0,
    "repeat_days" INTEGER NOT NULL DEFAULT 1,
    "recipient_roles" JSONB NOT NULL,
    "include_assignee" BOOLEAN NOT NULL DEFAULT true,
    "updated_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ServiceEscalationRulesSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationUxState_company_user_channel_key_uidx" ON "NotificationUxState"("company_id", "user_id", "channel", "notification_key");
CREATE INDEX "NotificationUxState_company_user_channel_snooze_idx" ON "NotificationUxState"("company_id", "user_id", "channel", "snoozed_until");
CREATE UNIQUE INDEX "ServiceEscalationRulesSettings_company_id_key" ON "ServiceEscalationRulesSettings"("company_id");
CREATE INDEX "ServiceEscalationRulesSettings_updated_by_id_idx" ON "ServiceEscalationRulesSettings"("updated_by_id");

ALTER TABLE "NotificationUxState" ADD CONSTRAINT "NotificationUxState_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationUxState" ADD CONSTRAINT "NotificationUxState_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceEscalationRulesSettings" ADD CONSTRAINT "ServiceEscalationRulesSettings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceEscalationRulesSettings" ADD CONSTRAINT "ServiceEscalationRulesSettings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
