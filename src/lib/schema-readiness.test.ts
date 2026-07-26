import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import {
  isMissingSchemaColumnError,
  schemaCompatibilityBannerMessage,
  schemaMismatchUserMessage,
} from "@/lib/schema-readiness";

describe("schema-readiness", () => {
  it("detects Prisma P2022 missing-column errors", () => {
    const error = new Prisma.PrismaClientKnownRequestError("Column not found", {
      code: "P2022",
      clientVersion: "test",
      meta: { column: "Property.deleted_at" },
    });
    expect(isMissingSchemaColumnError(error)).toBe(true);
  });

  it("detects raw-query missing-column errors", () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      'Raw query failed. Code: `42703`. Message: `column "deleted_at" does not exist`',
      {
        code: "P2010",
        clientVersion: "test",
        meta: { code: "42703", message: 'column "deleted_at" does not exist' },
      },
    );
    expect(isMissingSchemaColumnError(error)).toBe(true);
  });

  it("ignores unrelated Prisma errors", () => {
    const error = new Prisma.PrismaClientKnownRequestError("Unique constraint", {
      code: "P2002",
      clientVersion: "test",
    });
    expect(isMissingSchemaColumnError(error)).toBe(false);
    expect(isMissingSchemaColumnError(new Error("boom"))).toBe(false);
  });

  it("returns actionable Swedish operator messages", () => {
    expect(schemaMismatchUserMessage()).toMatch(/Database Release/);
    expect(schemaMismatchUserMessage()).toMatch(/migrate deploy/);
    expect(schemaCompatibilityBannerMessage()).toMatch(/kompatibilitetsläge|utan soft-delete/i);
  });
});
