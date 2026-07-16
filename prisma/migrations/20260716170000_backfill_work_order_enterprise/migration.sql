-- Komplettera äldre arbetsorder med Work Orders 2.0-data utan att ändra deras befintliga affärsdata.
-- Migreringen är idempotent: endast saknade värden och historikposter skapas.

-- 1. Tilldela stabila organisationsunika nummer per skapelseår.
WITH existing_max AS (
  SELECT
    "company_id",
    substring("work_order_number" FROM '^AO-([0-9]{4})-')::integer AS year,
    MAX(substring("work_order_number" FROM '-([0-9]{6})$')::integer) AS max_number
  FROM "WorkOrder"
  WHERE "work_order_number" ~ '^AO-[0-9]{4}-[0-9]{6}$'
  GROUP BY "company_id", substring("work_order_number" FROM '^AO-([0-9]{4})-')::integer
),
missing AS (
  SELECT
    w."id",
    w."company_id",
    EXTRACT(YEAR FROM w."created_at")::integer AS year,
    ROW_NUMBER() OVER (
      PARTITION BY w."company_id", EXTRACT(YEAR FROM w."created_at")::integer
      ORDER BY w."created_at", w."id"
    ) AS sequence_offset
  FROM "WorkOrder" w
  WHERE w."work_order_number" IS NULL
),
numbered AS (
  SELECT
    m."id",
    'AO-' || m.year::text || '-' || LPAD((COALESCE(e.max_number, 0) + m.sequence_offset)::text, 6, '0') AS work_order_number
  FROM missing m
  LEFT JOIN existing_max e
    ON e."company_id" = m."company_id" AND e.year = m.year
)
UPDATE "WorkOrder" w
SET "work_order_number" = n.work_order_number
FROM numbered n
WHERE w."id" = n."id" AND w."work_order_number" IS NULL;

-- 2. Beräkna saknade SLA-tider från ursprunglig skapandetid och prioritet.
UPDATE "WorkOrder"
SET
  "sla_response_due_at" = COALESCE(
    "sla_response_due_at",
    "created_at" + CASE "priority"
      WHEN 'urgent' THEN INTERVAL '1 hour'
      WHEN 'high' THEN INTERVAL '4 hours'
      WHEN 'low' THEN INTERVAL '48 hours'
      ELSE INTERVAL '24 hours'
    END
  ),
  "sla_resolution_due_at" = COALESCE(
    "sla_resolution_due_at",
    "created_at" + CASE "priority"
      WHEN 'urgent' THEN INTERVAL '4 hours'
      WHEN 'high' THEN INTERVAL '24 hours'
      WHEN 'low' THEN INTERVAL '168 hours'
      ELSE INTERVAL '72 hours'
    END
  ),
  "work_type" = COALESCE(NULLIF("work_type", ''), 'corrective'),
  "source" = CASE
    WHEN "ticket_id" IS NOT NULL AND COALESCE(NULLIF("source", ''), 'internal') = 'internal' THEN 'ticket'
    ELSE COALESCE(NULLIF("source", ''), 'internal')
  END
WHERE
  "sla_response_due_at" IS NULL
  OR "sla_resolution_due_at" IS NULL
  OR "work_type" IS NULL
  OR "work_type" = ''
  OR "source" IS NULL
  OR "source" = ''
  OR ("ticket_id" IS NOT NULL AND "source" = 'internal');

-- 3. Skapa en tydligt märkt initial statushändelse för äldre arbetsorder.
INSERT INTO "WorkOrderStatusEvent" (
  "id",
  "company_id",
  "work_order_id",
  "actor_user_id",
  "from_status",
  "to_status",
  "reason",
  "metadata",
  "created_at"
)
SELECT
  'legacy-' || w."id",
  w."company_id",
  w."id",
  w."created_by_id",
  NULL,
  w."status",
  'Migrerad från tidigare arbetsorderflöde',
  jsonb_build_object(
    'backfilled', true,
    'schemaVersion', 1,
    'originalCreatedAt', w."created_at",
    'workOrderNumber', w."work_order_number"
  ),
  w."created_at"
FROM "WorkOrder" w
WHERE NOT EXISTS (
  SELECT 1
  FROM "WorkOrderStatusEvent" e
  WHERE e."company_id" = w."company_id" AND e."work_order_id" = w."id"
)
ON CONFLICT ("id") DO NOTHING;

-- 4. Synkronisera nummerserierna med högsta faktiska nummer så framtida skapanden inte kolliderar.
INSERT INTO "WorkOrderNumberCounter" ("company_id", "year", "last_number", "updated_at")
SELECT
  "company_id",
  substring("work_order_number" FROM '^AO-([0-9]{4})-')::integer AS year,
  MAX(substring("work_order_number" FROM '-([0-9]{6})$')::integer) AS last_number,
  CURRENT_TIMESTAMP
FROM "WorkOrder"
WHERE "work_order_number" ~ '^AO-[0-9]{4}-[0-9]{6}$'
GROUP BY "company_id", substring("work_order_number" FROM '^AO-([0-9]{4})-')::integer
ON CONFLICT ("company_id", "year") DO UPDATE
SET
  "last_number" = GREATEST("WorkOrderNumberCounter"."last_number", EXCLUDED."last_number"),
  "updated_at" = CURRENT_TIMESTAMP;
