CREATE TABLE "ManagedDocument" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "property_id" TEXT,
    "unit_id" TEXT,
    "lease_id" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'other',
    "visibility" TEXT NOT NULL DEFAULT 'internal',
    "valid_until" TIMESTAMP(3),
    "file_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "storage_url" TEXT,
    "data_url" TEXT,
    "lifecycle_state" TEXT NOT NULL DEFAULT 'active',
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ManagedDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ManagedDocument_company_id_created_at_idx" ON "ManagedDocument"("company_id", "created_at");
CREATE INDEX "ManagedDocument_company_id_property_id_idx" ON "ManagedDocument"("company_id", "property_id");
CREATE INDEX "ManagedDocument_company_id_visibility_idx" ON "ManagedDocument"("company_id", "visibility");
CREATE INDEX "ManagedDocument_company_id_lifecycle_state_idx" ON "ManagedDocument"("company_id", "lifecycle_state");
CREATE INDEX "ManagedDocument_created_by_id_idx" ON "ManagedDocument"("created_by_id");
CREATE INDEX "ManagedDocument_storage_url_idx" ON "ManagedDocument"("storage_url");

ALTER TABLE "ManagedDocument" ADD CONSTRAINT "ManagedDocument_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManagedDocument" ADD CONSTRAINT "ManagedDocument_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ManagedDocument" ADD CONSTRAINT "ManagedDocument_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
