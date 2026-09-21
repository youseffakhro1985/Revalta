#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const attestations = JSON.parse(
  readFileSync(new URL("../src/lib/data-plane-attestations.json", import.meta.url), "utf8"),
);
const PRODUCTION_DATA_PLANE_ID = String(attestations.production || "");
const PREVIEW_DATA_PLANE_ID = String(attestations.preview || "");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function databaseTargetIdentity(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") return null;
    const labels = url.hostname.toLowerCase().split(".");
    if (labels.length > 0) labels[0] = labels[0].replace(/-pooler$/, "");
    const database = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    if (!labels[0] || !database) return null;
    const canonicalTarget = `${labels.join(".")}:${url.port || "5432"}/${database}`;
    return createHash("sha256").update(canonicalTarget).digest("hex");
  } catch {
    return null;
  }
}

const targetFlag = process.argv.includes("--target")
  ? process.argv[process.argv.indexOf("--target") + 1]
  : "";

if (targetFlag !== "production" && targetFlag !== "preview") {
  fail("Usage: node scripts/assert-database-target.mjs --target production|preview");
}

if (PRODUCTION_DATA_PLANE_ID === PREVIEW_DATA_PLANE_ID) {
  fail("BLOCKED: Preview and Production data-plane attestations must be different");
}

const databaseUrl = process.env.DATABASE_URL;
const directUrl = process.env.DIRECT_URL;
if (!databaseUrl || !directUrl) {
  fail("BLOCKED: DATABASE_URL and DIRECT_URL are required before a data-plane assertion");
}

const pooled = databaseTargetIdentity(databaseUrl);
const direct = databaseTargetIdentity(directUrl);
if (!pooled || !direct) {
  fail("BLOCKED: database target identity could not be derived without exposing connection details");
}
if (pooled !== direct) {
  fail(`BLOCKED: DATABASE_URL and DIRECT_URL resolve to different data planes pooled=${pooled} direct=${direct}`);
}

const expected = targetFlag === "production" ? PRODUCTION_DATA_PLANE_ID : PREVIEW_DATA_PLANE_ID;
const forbidden = targetFlag === "production" ? PREVIEW_DATA_PLANE_ID : PRODUCTION_DATA_PLANE_ID;

if (pooled === forbidden) {
  fail(`BLOCKED: ${targetFlag} database identity matches the opposite attested data plane`);
}
if (pooled !== expected) {
  fail(`BLOCKED: ${targetFlag} database identity ${pooled} does not match the reviewed attestation ${expected}`);
}

console.log(`Data-plane identity verified for ${targetFlag}: ${pooled}`);
console.log("DATABASE_URL and DIRECT_URL resolve to the same attested data plane");
