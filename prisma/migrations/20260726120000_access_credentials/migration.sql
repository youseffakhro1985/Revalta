-- CreateTable
CREATE TABLE "AccessCredential" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "credential_type" TEXT NOT NULL,
    "holder" TEXT,
    "unit" TEXT,
    "access_area" TEXT,
    "status" TEXT NOT NULL DEFAULT 'in_stock',
    "issued_at" TIMESTAMP(3),
    "return_due" TIMESTAMP(3),
    "note" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccessCredential_company_id_created_at_idx" ON "AccessCredential"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "AccessCredential_company_id_property_id_idx" ON "AccessCredential"("company_id", "property_id");

-- CreateIndex
CREATE INDEX "AccessCredential_company_id_status_idx" ON "AccessCredential"("company_id", "status");

-- CreateIndex
CREATE INDEX "AccessCredential_created_by_id_idx" ON "AccessCredential"("created_by_id");

-- AddForeignKey
ALTER TABLE "AccessCredential" ADD CONSTRAINT "AccessCredential_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessCredential" ADD CONSTRAINT "AccessCredential_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessCredential" ADD CONSTRAINT "AccessCredential_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
