#!/usr/bin/env node
import assert from "node:assert/strict";
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

console.log("Preview data-plane guard tests passed.");
