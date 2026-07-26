-- CreateTable
CREATE TABLE "CronJobRun" (
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "job_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "recipient" TEXT,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CronJobRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CronJobRun_job_type_created_at_idx" ON "CronJobRun"("job_type", "created_at");

-- CreateIndex
CREATE INDEX "CronJobRun_company_id_job_type_created_at_idx" ON "CronJobRun"("company_id", "job_type", "created_at");

-- CreateIndex
CREATE INDEX "CronJobRun_status_created_at_idx" ON "CronJobRun"("status", "created_at");

-- AddForeignKey
ALTER TABLE "CronJobRun" ADD CONSTRAINT "CronJobRun_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
