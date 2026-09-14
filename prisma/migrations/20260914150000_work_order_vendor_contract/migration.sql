-- Additive: koppla arbetsorder till ett tenant-ägt leverantörsavtal.
-- Kolumnen är valfri och probes i appen så Preview/Production inte 500:ar före Database Release.

ALTER TABLE "WorkOrder"
  ADD COLUMN IF NOT EXISTS "vendor_contract_id" TEXT;

CREATE INDEX IF NOT EXISTS "WorkOrder_vendor_contract_id_idx" ON "WorkOrder"("vendor_contract_id");
CREATE INDEX IF NOT EXISTS "WorkOrder_company_vendor_idx" ON "WorkOrder"("company_id", "vendor_contract_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WorkOrder_vendor_contract_id_fkey'
  ) THEN
    ALTER TABLE "WorkOrder"
      ADD CONSTRAINT "WorkOrder_vendor_contract_id_fkey"
      FOREIGN KEY ("vendor_contract_id") REFERENCES "VendorContract"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
