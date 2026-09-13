import { createHash } from "node:crypto";

/**
 * Produce a non-secret, stable fingerprint for a PostgreSQL data plane.
 *
 * Credentials and query parameters are deliberately excluded. Neon pooled and
 * direct hosts for the same endpoint normalize to the same identity by removing
 * the first-label `-pooler` suffix before hashing. The resulting digest is safe
 * to compare in release evidence without exposing a connection string.
 */
export function databaseTargetIdentity(value: string | undefined) {
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

export function previewDataPlaneIdentity(environment: string, databaseUrl?: string, directUrl?: string) {
  if (environment !== "preview") return undefined;
  const pooled = databaseTargetIdentity(databaseUrl);
  const direct = databaseTargetIdentity(directUrl);
  return {
    identity: pooled,
    directMatches: Boolean(pooled && direct && pooled === direct),
  };
}
