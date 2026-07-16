-- Koppla Work Orders 2.0 till byggnad och teknisk komponent.
-- Fälten är valfria för bakåtkompatibilitet och använder SET NULL för att bevara historiska arbetsorder.

ALTER TABLE "WorkOrder"
  ADD COLUMN IF NOT EXISTS "building_id" TEXT,
  ADD COLUMN IF NOT EXISTS "technical_asset_id" TEXT;

CREATE INDEX IF NOT EXISTS "WorkOrder_building_id_idx" ON "WorkOrder"("building_id");
CREATE INDEX IF NOT EXISTS "WorkOrder_technical_asset_id_idx" ON "WorkOrder"("technical_asset_id");
CREATE INDEX IF NOT EXISTS "WorkOrder_company_asset_status_idx" ON "WorkOrder"("company_id", "technical_asset_id", "status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WorkOrder_building_id_fkey'
  ) THEN
    ALTER TABLE "WorkOrder"
      ADD CONSTRAINT "WorkOrder_building_id_fkey"
      FOREIGN KEY ("building_id") REFERENCES "Building"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WorkOrder_technical_asset_id_fkey'
  ) THEN
    ALTER TABLE "WorkOrder"
      ADD CONSTRAINT "WorkOrder_technical_asset_id_fkey"
      FOREIGN KEY ("technical_asset_id") REFERENCES "PropertyTechnicalAsset"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
