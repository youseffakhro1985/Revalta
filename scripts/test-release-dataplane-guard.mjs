#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assertPreviewDataPlane, databaseTargetIdentity } from "./release-dataplane-guard.mjs";

const RELEASE_PREVIEW_BRANCH = "fix/revalta-preview-gate-2026-09-07";
const productionUrl = "postgresql://user:secret@prod-db.example.test:5432/revalta";
const productionPoolerUrl = "postgresql://user:secret@prod-db-pooler.example.test:5432/revalta?sslmode=require";
const isolatedUrl = "postgresql://preview:secret@preview-db.example.test:5432/revalta";
const isolatedPoolerUrl = "postgresql://preview:secret@preview-db-pooler.example.test:5432/revalta?sslmode=require";
const anotherIsolatedUrl = "postgresql://preview:secret@other-preview.example.test:5432/revalta";
const productionId = databaseTargetIdentity(productionUrl);
const isolatedId = databaseTargetIdentity(isolatedUrl);

assert.match(productionId ?? "", /^[a-f0-9]{64}$/);
assert.match(isolatedId ?? "", /^[a-f0-9]{64}$/);
assert.equal(databaseTargetIdentity(productionPoolerUrl), productionId, "pooler/direct normalization must produce one identity");
assert.equal(databaseTargetIdentity(isolatedPoolerUrl), isolatedId, "Preview pooler/direct normalization must produce one identity");

assert.throws(
  () => assertPreviewDataPlane({
    environment: "preview",
    branch: RELEASE_PREVIEW_BRANCH,
    databaseUrl: productionPoolerUrl,
    directUrl: productionUrl,
    productionDataPlaneId: productionId,
    reviewedPreviewDataPlaneId: isolatedId,
  }),
  /Production PostgreSQL data plane/,
  "Preview must fail closed when pointed at Production",
);

assert.throws(
  () => assertPreviewDataPlane({
    environment: "preview",
    branch: RELEASE_PREVIEW_BRANCH,
    databaseUrl: "postgresql://user:secret@preview-a.example.test/revalta",
    directUrl: "postgresql://user:secret@preview-b.example.test/revalta",
    productionDataPlaneId: productionId,
    reviewedPreviewDataPlaneId: isolatedId,
  }),
  /same data plane/,
  "Preview must reject mismatched pooled/direct targets",
);

assert.throws(
  () => assertPreviewDataPlane({
    environment: "preview",
    branch: RELEASE_PREVIEW_BRANCH,
    databaseUrl: isolatedUrl,
    directUrl: undefined,
    productionDataPlaneId: productionId,
    reviewedPreviewDataPlaneId: isolatedId,
  }),
  /valid PostgreSQL/,
  "Preview must reject a missing direct target",
);

assert.throws(
  () => assertPreviewDataPlane({
    environment: "preview",
    branch: RELEASE_PREVIEW_BRANCH,
    databaseUrl: "not-a-postgres-url",
    directUrl: "not-a-postgres-url",
    productionDataPlaneId: productionId,
    reviewedPreviewDataPlaneId: isolatedId,
  }),
  /valid PostgreSQL/,
  "Preview must reject invalid connection targets",
);

assert.throws(
  () => assertPreviewDataPlane({
    environment: "preview",
    branch: RELEASE_PREVIEW_BRANCH,
    databaseUrl: anotherIsolatedUrl,
    directUrl: anotherIsolatedUrl,
    productionDataPlaneId: productionId,
    reviewedPreviewDataPlaneId: isolatedId,
  }),
  /reviewed isolated Preview PostgreSQL data plane/,
  "Release Preview branch must reject an unreviewed datastore even when it is not Production",
);

assert.doesNotThrow(() => assertPreviewDataPlane({
  environment: "preview",
  branch: RELEASE_PREVIEW_BRANCH,
  databaseUrl: isolatedPoolerUrl,
  directUrl: isolatedUrl,
  productionDataPlaneId: productionId,
  reviewedPreviewDataPlaneId: isolatedId,
}));

assert.doesNotThrow(() => assertPreviewDataPlane({
  environment: "preview",
  branch: "another-feature-branch",
  databaseUrl: anotherIsolatedUrl,
  directUrl: anotherIsolatedUrl,
  productionDataPlaneId: productionId,
  reviewedPreviewDataPlaneId: isolatedId,
}));

assert.doesNotThrow(() => assertPreviewDataPlane({
  environment: "production",
  branch: "main",
  databaseUrl: productionUrl,
  directUrl: productionUrl,
  productionDataPlaneId: productionId,
  reviewedPreviewDataPlaneId: isolatedId,
}));

const vercelBuild = await readFile(new URL("./vercel-build.mjs", import.meta.url), "utf8");
const guardImport = 'import { assertPreviewDataPlane } from "./release-dataplane-guard.mjs";';
const guardCall = "assertPreviewDataPlane({";
const previewDirectUrlGuard = 'if (process.env.VERCEL_ENV === "preview")';
const branchBinding = "branch: process.env.VERCEL_GIT_COMMIT_REF";
const prismaGenerate = 'run("npx", ["prisma", "generate"])';

assert.ok(vercelBuild.includes(guardImport), "Vercel build must import the Preview data-plane guard");
assert.ok(vercelBuild.includes(previewDirectUrlGuard), "Vercel Preview build must require an explicit DIRECT_URL");
assert.ok(vercelBuild.includes(branchBinding), "Vercel build must pass the Git branch into the Preview data-plane guard");
assert.ok(vercelBuild.includes(guardCall), "Vercel build must invoke the Preview data-plane guard");
assert.ok(vercelBuild.includes(prismaGenerate), "Vercel build must still generate Prisma after guards");
assert.ok(
  vercelBuild.indexOf(guardCall) < vercelBuild.indexOf(prismaGenerate),
  "Preview data-plane guard must run before Prisma generation and application build",
);

console.log("Preview data-plane guard tests passed and release branch wiring is fail-closed.");
