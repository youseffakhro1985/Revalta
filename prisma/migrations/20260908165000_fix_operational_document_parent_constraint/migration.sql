-- Historical migrations added property_id and technical_asset_id without replacing
-- the original work-order/project-only parent constraint. Keep exactly one canonical
-- parent across every supported operational document scope.
ALTER TABLE "OperationalDocument"
DROP CONSTRAINT IF EXISTS "OperationalDocument_exactly_one_parent_check";

ALTER TABLE "OperationalDocument"
DROP CONSTRAINT IF EXISTS "OperationalDocument_single_parent_check";

ALTER TABLE "OperationalDocument"
ADD CONSTRAINT "OperationalDocument_exactly_one_parent_check"
CHECK (
  (("work_order_id" IS NOT NULL)::int +
   ("project_id" IS NOT NULL)::int +
   ("property_id" IS NOT NULL)::int +
   ("technical_asset_id" IS NOT NULL)::int) = 1
);
