-- Additive indexes matching real query shapes found in a performance audit:
-- Lease/Ticket/Property list reads filter by (company_id[, deleted_at]) and
-- sort by a timestamp column that wasn't covered by the existing indexes,
-- forcing a sort of the full matched row set instead of an index-ordered scan.
CREATE INDEX IF NOT EXISTS "Lease_company_id_status_updated_at_idx" ON "Lease"("company_id", "status", "updated_at");
CREATE INDEX IF NOT EXISTS "Ticket_company_id_deleted_at_created_at_idx" ON "Ticket"("company_id", "deleted_at", "created_at");
CREATE INDEX IF NOT EXISTS "Property_company_id_deleted_at_created_at_idx" ON "Property"("company_id", "deleted_at", "created_at");
