import { describe, expect, it } from "vitest";
import { PREVIEW_DATA_PLANE_ID, PRODUCTION_DATA_PLANE_ID } from "./data-plane-attestations";
import {
  databaseTargetIdentity,
  evaluateDataPlaneIsolation,
  previewDataPlaneIdentity,
  runtimeDataPlaneIdentity,
} from "./database-target-identity";

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

describe("runtimeDataPlaneIdentity", () => {
  it("is available for every environment including production", () => {
    const pooled = "postgresql://user:secret@ep-production-pooler.eu-central-1.aws.neon.tech/neondb";
    const direct = "postgresql://user:secret@ep-production.eu-central-1.aws.neon.tech/neondb";
    expect(runtimeDataPlaneIdentity(pooled, direct)).toEqual({
      identity: databaseTargetIdentity(pooled),
      directMatches: true,
    });
  });
});

describe("evaluateDataPlaneIsolation", () => {
  const production = {
    identity: PRODUCTION_DATA_PLANE_ID,
    directMatches: true,
  };
  const preview = {
    identity: PREVIEW_DATA_PLANE_ID,
    directMatches: true,
  };

  it("keeps local and test runtimes from failing closed on missing attestations", () => {
    expect(evaluateDataPlaneIsolation("local", { identity: null, directMatches: false }).ok).toBe(true);
    expect(evaluateDataPlaneIsolation("test", { identity: null, directMatches: false }).ok).toBe(true);
    expect(evaluateDataPlaneIsolation("development", production).ok).toBe(true);
  });

  it("accepts Production only when the attested production dataplane matches", () => {
    expect(evaluateDataPlaneIsolation("production", production)).toEqual({ ok: true, reason: null });
  });

  it("accepts Preview only when the attested preview dataplane matches", () => {
    expect(evaluateDataPlaneIsolation("preview", preview)).toEqual({ ok: true, reason: null });
  });

  it("fails when Production is attached to the Preview dataplane", () => {
    expect(evaluateDataPlaneIsolation("production", preview)).toEqual({
      ok: false,
      reason: "preview-identity-in-production",
    });
  });

  it("fails when Preview is attached to the Production dataplane", () => {
    expect(evaluateDataPlaneIsolation("preview", production)).toEqual({
      ok: false,
      reason: "production-identity-in-preview",
    });
  });

  it("fails when pooled and direct identities disagree", () => {
    expect(evaluateDataPlaneIsolation("production", {
      identity: PRODUCTION_DATA_PLANE_ID,
      directMatches: false,
    }).reason).toBe("direct-mismatch");
  });

  it("fails when a production identity is missing or unexpected", () => {
    expect(evaluateDataPlaneIsolation("production", { identity: null, directMatches: false }).reason).toBe("missing-identity");
    expect(evaluateDataPlaneIsolation("production", {
      identity: "ab".repeat(32),
      directMatches: true,
    }).reason).toBe("unexpected-production-identity");
  });

  it("keeps the reviewed production and preview attestations distinct", () => {
    expect(PRODUCTION_DATA_PLANE_ID).not.toBe(PREVIEW_DATA_PLANE_ID);
    expect(PRODUCTION_DATA_PLANE_ID).toMatch(/^[a-f0-9]{64}$/);
    expect(PREVIEW_DATA_PLANE_ID).toMatch(/^[a-f0-9]{64}$/);
  });
});
