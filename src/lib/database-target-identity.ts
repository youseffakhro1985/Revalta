import { createHash } from "node:crypto";
import { PREVIEW_DATA_PLANE_ID, PRODUCTION_DATA_PLANE_ID } from "@/lib/data-plane-attestations";

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

export type DataPlaneSnapshot = {
  identity: string | null;
  directMatches: boolean;
};

export type DataPlaneIsolation = {
  ok: boolean;
  reason: string | null;
};

export function runtimeDataPlaneIdentity(databaseUrl?: string, directUrl?: string): DataPlaneSnapshot {
  const pooled = databaseTargetIdentity(databaseUrl);
  const direct = databaseTargetIdentity(directUrl);
  return {
    identity: pooled,
    directMatches: Boolean(pooled && direct && pooled === direct),
  };
}

export function previewDataPlaneIdentity(environment: string, databaseUrl?: string, directUrl?: string) {
  if (environment !== "preview") return undefined;
  return runtimeDataPlaneIdentity(databaseUrl, directUrl);
}

/**
 * Fail closed when Production or Preview is attached to the wrong datastore.
 * Local/test/development runtimes are not attested and therefore not 503'd.
 */
export function evaluateDataPlaneIsolation(
  environment: string,
  snapshot: DataPlaneSnapshot,
  attestations: { production: string; preview: string } = {
    production: PRODUCTION_DATA_PLANE_ID,
    preview: PREVIEW_DATA_PLANE_ID,
  },
): DataPlaneIsolation {
  if (attestations.production === attestations.preview) {
    return { ok: false, reason: "attestation-collision" };
  }

  const env = environment.toLowerCase();
  if (env !== "production" && env !== "preview") {
    return { ok: true, reason: null };
  }

  if (!snapshot.identity) return { ok: false, reason: "missing-identity" };
  if (!snapshot.directMatches) return { ok: false, reason: "direct-mismatch" };

  if (env === "production") {
    if (snapshot.identity === attestations.preview) {
      return { ok: false, reason: "preview-identity-in-production" };
    }
    if (snapshot.identity !== attestations.production) {
      return { ok: false, reason: "unexpected-production-identity" };
    }
  }

  if (env === "preview") {
    if (snapshot.identity === attestations.production) {
      return { ok: false, reason: "production-identity-in-preview" };
    }
    if (snapshot.identity !== attestations.preview) {
      return { ok: false, reason: "unexpected-preview-identity" };
    }
  }

  return { ok: true, reason: null };
}
