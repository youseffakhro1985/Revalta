-- CreateTable
CREATE TABLE "WorkOrderComment" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "work_order_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "is_internal" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOrderComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectComment" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "is_internal" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalDocument" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "work_order_id" TEXT,
    "project_id" TEXT,
    "uploaded_by_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'other',
    "visibility" TEXT NOT NULL DEFAULT 'internal',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkOrderComment_company_id_work_order_id_created_at_idx" ON "WorkOrderComment"("company_id", "work_order_id", "created_at");
CREATE INDEX "WorkOrderComment_user_id_idx" ON "WorkOrderComment"("user_id");
CREATE INDEX "ProjectComment_company_id_project_id_created_at_idx" ON "ProjectComment"("company_id", "project_id", "created_at");
CREATE INDEX "ProjectComment_user_id_idx" ON "ProjectComment"("user_id");
CREATE INDEX "OperationalDocument_company_id_work_order_id_created_at_idx" ON "OperationalDocument"("company_id", "work_order_id", "created_at");
CREATE INDEX "OperationalDocument_company_id_project_id_created_at_idx" ON "OperationalDocument"("company_id", "project_id", "created_at");
CREATE INDEX "OperationalDocument_uploaded_by_id_idx" ON "OperationalDocument"("uploaded_by_id");
CREATE INDEX "OperationalDocument_storage_key_idx" ON "OperationalDocument"("storage_key");

-- AddForeignKey
ALTER TABLE "WorkOrderComment" ADD CONSTRAINT "WorkOrderComment_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrderComment" ADD CONSTRAINT "WorkOrderComment_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrderComment" ADD CONSTRAINT "WorkOrderComment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectComment" ADD CONSTRAINT "ProjectComment_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectComment" ADD CONSTRAINT "ProjectComment_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectComment" ADD CONSTRAINT "ProjectComment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OperationalDocument" ADD CONSTRAINT "OperationalDocument_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OperationalDocument" ADD CONSTRAINT "OperationalDocument_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OperationalDocument" ADD CONSTRAINT "OperationalDocument_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OperationalDocument" ADD CONSTRAINT "OperationalDocument_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Ensure each operational document belongs to exactly one operational entity.
ALTER TABLE "OperationalDocument"
ADD CONSTRAINT "OperationalDocument_exactly_one_parent_check"
CHECK (("work_order_id" IS NOT NULL)::int + ("project_id" IS NOT NULL)::int = 1);
