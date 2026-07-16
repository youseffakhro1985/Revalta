-- Replace audit-log based rental records with tenant-isolated relational data.
-- The migration is idempotent and backfills every valid legacy lease record.

CREATE TABLE IF NOT EXISTS "LeaseHolder" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "party_type" TEXT NOT NULL DEFAULT 'individual',
  "name" TEXT NOT NULL,
  "contact_name" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "organization_number" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeaseHolder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Lease" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "property_id" TEXT NOT NULL,
  "unit_id" TEXT NOT NULL,
  "lease_holder_id" TEXT NOT NULL,
  "created_by_id" TEXT NOT NULL,
  "lease_number" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "start_date" TIMESTAMP(3),
  "end_date" TIMESTAMP(3),
  "notice_date" TIMESTAMP(3),
  "monthly_rent" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "deposit" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "annual_index_percent" DECIMAL(7,3) NOT NULL DEFAULT 0,
  "payment_terms_days" INTEGER NOT NULL DEFAULT 30,
  "note" TEXT,
  "ended_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Lease_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LeaseHolder_company_id_name_idx" ON "LeaseHolder"("company_id", "name");
CREATE INDEX IF NOT EXISTS "LeaseHolder_company_id_email_idx" ON "LeaseHolder"("company_id", "email");
CREATE INDEX IF NOT EXISTS "LeaseHolder_company_id_status_idx" ON "LeaseHolder"("company_id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "Lease_company_id_lease_number_key" ON "Lease"("company_id", "lease_number");
CREATE INDEX IF NOT EXISTS "Lease_company_id_status_idx" ON "Lease"("company_id", "status");
CREATE INDEX IF NOT EXISTS "Lease_property_id_idx" ON "Lease"("property_id");
CREATE INDEX IF NOT EXISTS "Lease_unit_id_status_idx" ON "Lease"("unit_id", "status");
CREATE INDEX IF NOT EXISTS "Lease_lease_holder_id_idx" ON "Lease"("lease_holder_id");
CREATE INDEX IF NOT EXISTS "Lease_start_date_idx" ON "Lease"("start_date");
CREATE INDEX IF NOT EXISTS "Lease_end_date_idx" ON "Lease"("end_date");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LeaseHolder_company_id_fkey' AND conrelid = '"LeaseHolder"'::regclass) THEN
    ALTER TABLE "LeaseHolder" ADD CONSTRAINT "LeaseHolder_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Lease_company_id_fkey' AND conrelid = '"Lease"'::regclass) THEN
    ALTER TABLE "Lease" ADD CONSTRAINT "Lease_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Lease_property_id_fkey' AND conrelid = '"Lease"'::regclass) THEN
    ALTER TABLE "Lease" ADD CONSTRAINT "Lease_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Lease_unit_id_fkey' AND conrelid = '"Lease"'::regclass) THEN
    ALTER TABLE "Lease" ADD CONSTRAINT "Lease_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Lease_lease_holder_id_fkey' AND conrelid = '"Lease"'::regclass) THEN
    ALTER TABLE "Lease" ADD CONSTRAINT "Lease_lease_holder_id_fkey" FOREIGN KEY ("lease_holder_id") REFERENCES "LeaseHolder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Lease_created_by_id_fkey' AND conrelid = '"Lease"'::regclass) THEN
    ALTER TABLE "Lease" ADD CONSTRAINT "Lease_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
DECLARE
  legacy RECORD;
  resolved_unit_id TEXT;
  resolved_holder_id TEXT;
  resolved_creator_id TEXT;
  resolved_status TEXT;
  resolved_holder_name TEXT;
  resolved_start_date TIMESTAMP(3);
  resolved_end_date TIMESTAMP(3);
  resolved_notice_date TIMESTAMP(3);
BEGIN
  FOR legacy IN
    SELECT log."id", log."company_id", log."entity_id" AS property_id,
           log."actor_user_id", log."metadata", log."created_at"
    FROM "AuditLog" log
    INNER JOIN "Property" property ON property."id" = log."entity_id" AND property."company_id" = log."company_id"
    WHERE log."action" = 'lease.created'
      AND log."company_id" IS NOT NULL
      AND COALESCE(log."metadata"->>'unit', '') <> ''
    ORDER BY log."created_at" DESC
  LOOP
    SELECT "id" INTO resolved_creator_id
    FROM "User"
    WHERE "id" = legacy."actor_user_id" AND "company_id" = legacy."company_id"
    LIMIT 1;

    IF resolved_creator_id IS NULL THEN
      SELECT "id" INTO resolved_creator_id
      FROM "User"
      WHERE "company_id" = legacy."company_id"
      ORDER BY "created_at" ASC
      LIMIT 1;
    END IF;

    IF resolved_creator_id IS NULL THEN
      CONTINUE;
    END IF;

    SELECT "id" INTO resolved_unit_id
    FROM "Unit"
    WHERE "property_id" = legacy.property_id
      AND lower("designation") = lower(legacy."metadata"->>'unit')
    ORDER BY "created_at" ASC
    LIMIT 1;

    IF resolved_unit_id IS NULL THEN
      resolved_unit_id := 'lease-unit-' || md5(legacy.property_id || ':' || lower(legacy."metadata"->>'unit'));
      INSERT INTO "Unit" ("id", "property_id", "designation", "unit_type", "area", "status", "created_at", "updated_at")
      VALUES (
        resolved_unit_id,
        legacy.property_id,
        legacy."metadata"->>'unit',
        CASE WHEN legacy."metadata"->>'object_type' IN ('apartment', 'commercial', 'storage', 'garage', 'parking', 'other') THEN legacy."metadata"->>'object_type' ELSE 'other' END,
        CASE WHEN jsonb_typeof(legacy."metadata"->'area') = 'number' THEN GREATEST((legacy."metadata"->>'area')::double precision, 0) ELSE NULL END,
        'active',
        legacy."created_at",
        legacy."created_at"
      ) ON CONFLICT ("id") DO NOTHING;
    END IF;

    resolved_status := CASE
      WHEN legacy."metadata"->>'status' IN ('reserved', 'active', 'notice', 'ended') THEN legacy."metadata"->>'status'
      WHEN legacy."metadata"->>'status' = 'vacant' THEN 'vacant'
      ELSE 'draft'
    END;

    -- A legacy vacancy represented inventory rather than a contract. The unit above
    -- preserves it without manufacturing an empty lease.
    IF resolved_status = 'vacant' THEN
      CONTINUE;
    END IF;

    IF resolved_status IN ('reserved', 'active', 'notice') AND EXISTS (
      SELECT 1 FROM "Lease" WHERE "unit_id" = resolved_unit_id AND "status" IN ('reserved', 'active', 'notice')
    ) THEN
      resolved_status := 'ended';
    END IF;

    resolved_holder_id := 'lease-holder-' || md5(legacy."id");
    resolved_holder_name := COALESCE(NULLIF(trim(legacy."metadata"->>'tenant_name'), ''), 'Ej angiven hyrespart');

    INSERT INTO "LeaseHolder" ("id", "company_id", "party_type", "name", "status", "created_at", "updated_at")
    VALUES (resolved_holder_id, legacy."company_id", 'individual', resolved_holder_name, 'active', legacy."created_at", legacy."created_at")
    ON CONFLICT ("id") DO NOTHING;

    resolved_start_date := NULL;
    resolved_end_date := NULL;
    resolved_notice_date := NULL;

    IF COALESCE(legacy."metadata"->>'start_date', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
      BEGIN
        resolved_start_date := (legacy."metadata"->>'start_date')::timestamp;
      EXCEPTION WHEN OTHERS THEN
        resolved_start_date := NULL;
      END;
    END IF;
    IF COALESCE(legacy."metadata"->>'end_date', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
      BEGIN
        resolved_end_date := (legacy."metadata"->>'end_date')::timestamp;
      EXCEPTION WHEN OTHERS THEN
        resolved_end_date := NULL;
      END;
    END IF;
    IF COALESCE(legacy."metadata"->>'notice_date', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
      BEGIN
        resolved_notice_date := (legacy."metadata"->>'notice_date')::timestamp;
      EXCEPTION WHEN OTHERS THEN
        resolved_notice_date := NULL;
      END;
    END IF;

    INSERT INTO "Lease" (
      "id", "company_id", "property_id", "unit_id", "lease_holder_id", "created_by_id",
      "lease_number", "status", "start_date", "end_date", "notice_date", "monthly_rent",
      "deposit", "annual_index_percent", "payment_terms_days", "note", "ended_at", "created_at", "updated_at"
    ) VALUES (
      legacy."id", legacy."company_id", legacy.property_id, resolved_unit_id, resolved_holder_id, resolved_creator_id,
      'LEG-' || upper(substr(replace(legacy."id", '-', ''), 1, 12)), resolved_status,
      resolved_start_date, resolved_end_date, resolved_notice_date,
      CASE WHEN jsonb_typeof(legacy."metadata"->'monthly_rent') = 'number' THEN LEAST(GREATEST((legacy."metadata"->>'monthly_rent')::numeric, 0), 999999999999.99) ELSE 0 END,
      0, 0, 30, NULLIF(trim(legacy."metadata"->>'note'), ''),
      CASE WHEN resolved_status = 'ended' THEN legacy."created_at" ELSE NULL END,
      legacy."created_at", legacy."created_at"
    ) ON CONFLICT ("id") DO NOTHING;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "Lease_unit_occupancy_unique"
  ON "Lease"("unit_id")
  WHERE "status" IN ('reserved', 'active', 'notice');

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LeaseHolder_party_type_check' AND conrelid = '"LeaseHolder"'::regclass) THEN
    ALTER TABLE "LeaseHolder" ADD CONSTRAINT "LeaseHolder_party_type_check" CHECK ("party_type" IN ('individual', 'company', 'association'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LeaseHolder_status_check' AND conrelid = '"LeaseHolder"'::regclass) THEN
    ALTER TABLE "LeaseHolder" ADD CONSTRAINT "LeaseHolder_status_check" CHECK ("status" IN ('active', 'inactive', 'archived'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Lease_status_check' AND conrelid = '"Lease"'::regclass) THEN
    ALTER TABLE "Lease" ADD CONSTRAINT "Lease_status_check" CHECK ("status" IN ('draft', 'reserved', 'active', 'notice', 'ended', 'cancelled'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Lease_financial_values_check' AND conrelid = '"Lease"'::regclass) THEN
    ALTER TABLE "Lease" ADD CONSTRAINT "Lease_financial_values_check" CHECK (
      "monthly_rent" >= 0 AND "deposit" >= 0 AND "annual_index_percent" BETWEEN 0 AND 100 AND "payment_terms_days" BETWEEN 0 AND 120
    );
  END IF;
END $$;
