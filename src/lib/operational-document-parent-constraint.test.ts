import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("OperationalDocument parent constraint migration", () => {
  const sql = readFileSync(
    resolve(
      process.cwd(),
      "prisma/migrations/20260913220000_operational_document_parent_constraint/migration.sql",
    ),
    "utf8",
  );

  it("drops the stacked CHECKs and requires exactly one of four parents", () => {
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS "OperationalDocument_exactly_one_parent_check"');
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS "OperationalDocument_single_parent_check"');
    expect(sql).toContain('"work_order_id" IS NOT NULL');
    expect(sql).toContain('"project_id" IS NOT NULL');
    expect(sql).toContain('"property_id" IS NOT NULL');
    expect(sql).toContain('"technical_asset_id" IS NOT NULL');
    expect(sql).toMatch(/\) = 1/);
  });
});
