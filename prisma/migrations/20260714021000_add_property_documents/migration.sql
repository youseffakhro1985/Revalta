ALTER TABLE "OperationalDocument" ADD COLUMN "property_id" TEXT;

CREATE INDEX "OperationalDocument_company_id_property_id_created_at_idx"
ON "OperationalDocument"("company_id", "property_id", "created_at");

ALTER TABLE "OperationalDocument"
ADD CONSTRAINT "OperationalDocument_property_id_fkey"
FOREIGN KEY ("property_id") REFERENCES "Property"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OperationalDocument"
ADD CONSTRAINT "OperationalDocument_single_parent_check"
CHECK (
  (("work_order_id" IS NOT NULL)::int +
   ("project_id" IS NOT NULL)::int +
   ("property_id" IS NOT NULL)::int) = 1
);
