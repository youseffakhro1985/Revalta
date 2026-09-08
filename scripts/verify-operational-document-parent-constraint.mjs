#!/usr/bin/env node
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

try {
  const constraints = await db.$queryRawUnsafe(`
    SELECT conname, pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conrelid = '"OperationalDocument"'::regclass
      AND contype = 'c'
      AND conname IN (
        'OperationalDocument_exactly_one_parent_check',
        'OperationalDocument_single_parent_check'
      )
    ORDER BY conname
  `);

  if (constraints.length !== 1) {
    throw new Error(`Expected exactly one OperationalDocument parent CHECK constraint, found ${constraints.length}`);
  }

  const [constraint] = constraints;
  if (constraint.conname !== "OperationalDocument_exactly_one_parent_check") {
    throw new Error(`Unexpected OperationalDocument parent constraint: ${constraint.conname}`);
  }

  const definition = String(constraint.definition || "").toLowerCase();
  for (const column of ["work_order_id", "project_id", "property_id", "technical_asset_id"]) {
    if (!definition.includes(column)) {
      throw new Error(`OperationalDocument parent constraint does not include ${column}`);
    }
  }

  if (!definition.includes("= 1")) {
    throw new Error("OperationalDocument parent constraint must require exactly one parent");
  }

  console.log("OperationalDocument parent constraint verified: exactly one of work_order/project/property/technical_asset.");
} finally {
  await db.$disconnect();
}
