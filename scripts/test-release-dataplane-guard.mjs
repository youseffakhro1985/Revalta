#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assertPreviewDataPlane, databaseTargetIdentity } from "./release-dataplane-guard.mjs";

const productionUrl = "postgresql://user:secret@prod-db.example.test:5432/revalta";
const productionPoolerUrl = "postgresql://user:secret@prod-db-pooler.example.test:5432/revalta?sslmode=require";
const productionId = databaseTargetIdentity(productionUrl);

assert.match(productionId ?? "", /^[a-f0-9]{64}$/);
assert.equal(databaseTargetIdentity(productionPoolerUrl), productionId, "pooler/direct normalization must produce one identity");

assert.throws(
  () => assertPreviewDataPlane({
    environment: "preview",
    databaseUrl: productionPoolerUrl,
    directUrl: productionUrl,
    productionDataPlaneId: productionId,
  }),
  /Production PostgreSQL data plane/,
  "Preview must fail closed when pointed at Production",
);

assert.throws(
  () => assertPreviewDataPlane({
    environment: "preview",
    databaseUrl: "postgresql://user:secret@preview-a.example.test/revalta",
    directUrl: "postgresql://user:secret@preview-b.example.test/revalta",
    productionDataPlaneId: productionId,
  }),
  /same data plane/,
  "Preview must reject mismatched pooled/direct targets",
);

assert.throws(
  () => assertPreviewDataPlane({
    environment: "preview",
    databaseUrl: "postgresql://user:secret@preview-db.example.test/revalta",
    directUrl: undefined,
    productionDataPlaneId: productionId,
  }),
  /valid PostgreSQL/,
  "Preview must reject a missing direct target",
);

assert.throws(
  () => assertPreviewDataPlane({
    environment: "preview",
    databaseUrl: "not-a-postgres-url",
    directUrl: "not-a-postgres-url",
    productionDataPlaneId: productionId,
  }),
  /valid PostgreSQL/,
  "Preview must reject invalid connection targets",
);

assert.doesNotThrow(() => assertPreviewDataPlane({
  environment: "preview",
  databaseUrl: "postgresql://preview:secret@preview-db-pooler.example.test/revalta",
  directUrl: "postgresql://preview:secret@preview-db.example.test/revalta",
  productionDataPlaneId: productionId,
}));

assert.doesNotThrow(() => assertPreviewDataPlane({
  environment: "production",
  databaseUrl: productionUrl,
  directUrl: productionUrl,
  productionDataPlaneId: productionId,
}));

const vercelBuild = await readFile(new URL("./vercel-build.mjs", import.meta.url), "utf8");
const guardImport = 'import { assertPreviewDataPlane } from "./release-dataplane-guard.mjs";';
const guardCall = "assertPreviewDataPlane({";
const previewDirectUrlGuard = 'if (process.env.VERCEL_ENV === "preview")';
const prismaGenerate = 'run("npx", ["prisma", "generate"])';

assert.ok(vercelBuild.includes(guardImport), "Vercel build must import the Preview data-plane guard");
assert.ok(vercelBuild.includes(previewDirectUrlGuard), "Vercel Preview build must require an explicit DIRECT_URL");
assert.ok(vercelBuild.includes(guardCall), "Vercel build must invoke the Preview data-plane guard");
assert.ok(vercelBuild.includes(prismaGenerate), "Vercel build must still generate Prisma after guards");
assert.ok(
  vercelBuild.indexOf(guardCall) < vercelBuild.indexOf(prismaGenerate),
  "Preview data-plane guard must run before Prisma generation and application build",
);

console.log("Preview data-plane guard tests passed and build wiring is fail-closed.");
