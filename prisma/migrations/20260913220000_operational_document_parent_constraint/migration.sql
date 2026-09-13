-- Property and component documents added extra parent columns and a second CHECK
-- without dropping the original work-order/project XOR. Postgres still enforces
-- the first constraint, so property/component uploads fail. Leave exactly one
-- parent among work order, project, property and technical asset.

ALTER TABLE "OperationalDocument" DROP CONSTRAINT IF EXISTS "OperationalDocument_exactly_one_parent_check";
ALTER TABLE "OperationalDocument" DROP CONSTRAINT IF EXISTS "OperationalDocument_single_parent_check";

ALTER TABLE "OperationalDocument"
ADD CONSTRAINT "OperationalDocument_exactly_one_parent_check"
CHECK (
  (
    ("work_order_id" IS NOT NULL)::int +
    ("project_id" IS NOT NULL)::int +
    ("property_id" IS NOT NULL)::int +
    ("technical_asset_id" IS NOT NULL)::int
  ) = 1
);
