-- Expand the property register with professional metadata.
ALTER TABLE "Property"
ADD COLUMN "property_identifier" TEXT,
ADD COLUMN "property_type" TEXT NOT NULL DEFAULT 'residential',
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active',
ADD COLUMN "construction_year" INTEGER,
ADD COLUMN "total_area" DOUBLE PRECISION,
ADD COLUMN "boa" DOUBLE PRECISION,
ADD COLUMN "loa" DOUBLE PRECISION,
ADD COLUMN "manager_name" TEXT,
ADD COLUMN "contact_name" TEXT,
ADD COLUMN "contact_email" TEXT,
ADD COLUMN "contact_phone" TEXT,
ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "Building" (
  "id" TEXT NOT NULL,
  "property_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "address" TEXT,
  "construction_year" INTEGER,
  "floors" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Building_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Unit" (
  "id" TEXT NOT NULL,
  "property_id" TEXT NOT NULL,
  "building_id" TEXT,
  "designation" TEXT NOT NULL,
  "unit_type" TEXT NOT NULL DEFAULT 'apartment',
  "floor" TEXT,
  "area" DOUBLE PRECISION,
  "rooms" DOUBLE PRECISION,
  "status" TEXT NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Property_company_id_idx" ON "Property"("company_id");
CREATE INDEX "Property_user_id_idx" ON "Property"("user_id");
CREATE INDEX "Property_city_idx" ON "Property"("city");
CREATE INDEX "Building_property_id_idx" ON "Building"("property_id");
CREATE INDEX "Unit_property_id_idx" ON "Unit"("property_id");
CREATE INDEX "Unit_building_id_idx" ON "Unit"("building_id");
CREATE INDEX "Unit_unit_type_idx" ON "Unit"("unit_type");

ALTER TABLE "Building"
ADD CONSTRAINT "Building_property_id_fkey"
FOREIGN KEY ("property_id") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Unit"
ADD CONSTRAINT "Unit_property_id_fkey"
FOREIGN KEY ("property_id") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Unit"
ADD CONSTRAINT "Unit_building_id_fkey"
FOREIGN KEY ("building_id") REFERENCES "Building"("id") ON DELETE SET NULL ON UPDATE CASCADE;