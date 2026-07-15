ALTER TABLE "OperationalDocument"
  ADD COLUMN "technical_asset_id" TEXT;

CREATE INDEX "OperationalDocument_technical_asset_created_idx"
  ON "OperationalDocument"("technical_asset_id", "created_at");

ALTER TABLE "OperationalDocument"
  ADD CONSTRAINT "OperationalDocument_technical_asset_id_fkey"
  FOREIGN KEY ("technical_asset_id") REFERENCES "PropertyTechnicalAsset"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
