import { createHash } from "node:crypto";
import { PRODUCTION_DATA_PLANE_ID } from "../e2e/data-plane-attestations.mjs";

const POSTGRES_PROTOCOLS = new Set(["postgres:", "postgresql:"]);

export function databaseTargetIdentity(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!POSTGRES_PROTOCOLS.has(url.protocol)) return null;

    const labels = url.hostname.toLowerCase().split(".");
    if (labels.length === 0) return null;
    labels[0] = labels[0].replace(/-pooler$/, "");

    const database = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    if (!labels[0] || !database) return null;

    const canonicalTarget = `${labels.join(".")}:${url.port || "5432"}/${database}`;
    return createHash("sha256").update(canonicalTarget).digest("hex");
  } catch {
    return null;
  }
}

export function assertPreviewDataPlane({
  environment,
  databaseUrl,
  directUrl,
  productionDataPlaneId = PRODUCTION_DATA_PLANE_ID,
}) {
  if (environment !== "preview") return;

  const pooled = databaseTargetIdentity(databaseUrl);
  const direct = databaseTargetIdentity(directUrl);

  if (!pooled || !direct) {
    throw new Error("Preview build requires valid PostgreSQL DATABASE_URL and DIRECT_URL targets");
  }
  if (pooled !== direct) {
    throw new Error("Preview build requires DATABASE_URL and DIRECT_URL to resolve to the same data plane");
  }
  if (pooled === productionDataPlaneId) {
    throw new Error("BLOCKED: Vercel Preview is configured to use the reviewed Production PostgreSQL data plane");
  }
}
