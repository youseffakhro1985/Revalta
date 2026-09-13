import { describe, expect, it } from "vitest";
import { databaseTargetIdentity, previewDataPlaneIdentity } from "./database-target-identity";

describe("databaseTargetIdentity", () => {
  it("normalizes Neon pooled and direct hosts to one non-secret identity", () => {
    const pooled = databaseTargetIdentity("postgresql://user:secret@ep-synthetic-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require");
    const direct = databaseTargetIdentity("postgresql://other:different@ep-synthetic.eu-central-1.aws.neon.tech:5432/neondb?sslmode=require");
    expect(pooled).toMatch(/^[a-f0-9]{64}$/);
    expect(pooled).toBe(direct);
  });

  it("changes when the endpoint or database changes", () => {
    const base = databaseTargetIdentity("postgresql://user:secret@ep-preview.eu-central-1.aws.neon.tech/neondb");
    expect(databaseTargetIdentity("postgresql://user:secret@ep-production.eu-central-1.aws.neon.tech/neondb")).not.toBe(base);
    expect(databaseTargetIdentity("postgresql://user:secret@ep-preview.eu-central-1.aws.neon.tech/otherdb")).not.toBe(base);
  });

  it("never includes credentials or host data in the returned digest", () => {
    const identity = databaseTargetIdentity("postgresql://very-sensitive-user:very-sensitive-password@database.example.test/revalta");
    expect(identity).toMatch(/^[a-f0-9]{64}$/);
    expect(identity).not.toContain("sensitive");
    expect(identity).not.toContain("database.example.test");
  });

  it.each([undefined, "", "not-a-url", "https://example.test/db", "postgresql://host-only"])("rejects unusable database target %s", (value) => {
    expect(databaseTargetIdentity(value)).toBeNull();
  });
});

describe("previewDataPlaneIdentity", () => {
  const pooled = "postgresql://user:secret@ep-preview-pooler.eu-central-1.aws.neon.tech/neondb";
  const direct = "postgresql://user:secret@ep-preview.eu-central-1.aws.neon.tech/neondb";

  it("is exposed only for Preview", () => {
    expect(previewDataPlaneIdentity("production", pooled, direct)).toBeUndefined();
    expect(previewDataPlaneIdentity("development", pooled, direct)).toBeUndefined();
  });

  it("proves pooled and direct URLs resolve to the same normalized data plane", () => {
    expect(previewDataPlaneIdentity("preview", pooled, direct)).toEqual({
      identity: databaseTargetIdentity(pooled),
      directMatches: true,
    });
  });

  it("fails closed when pooled and direct targets disagree", () => {
    const other = "postgresql://user:secret@ep-other.eu-central-1.aws.neon.tech/neondb";
    expect(previewDataPlaneIdentity("preview", pooled, other)?.directMatches).toBe(false);
  });
});
