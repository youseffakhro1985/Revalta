import db from "@/lib/db";
import { canViewOperations, getCurrentUser } from "@/lib/current-user";
import { isModernStorageOnly } from "@/lib/dual-list";
import { getSchemaReadiness } from "@/lib/schema-readiness";
import { getStorageToken, hasStorageConfig } from "@/lib/storage";
import { createLogger } from "@/lib/structured-logger";
import { NextRequest, NextResponse } from "next/server";

function buildEnvSnapshot() {
  const blobToken = Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
  const legacyStorageToken = Boolean(process.env.STORAGE_PROVIDER_KEY?.trim());
  return {
    databaseUrl: Boolean(process.env.DATABASE_URL),
    directUrl: Boolean(process.env.DIRECT_URL),
    jwtSecret: Boolean(process.env.JWT_SECRET),
    emailFrom: Boolean(process.env.EMAIL_FROM),
    emailProvider: Boolean(process.env.EMAIL_PROVIDER_API_KEY),
    smsProvider: Boolean(process.env.SMS_PROVIDER_API_KEY),
    stripe: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET),
    storage: hasStorageConfig(),
    blobReadWriteToken: blobToken,
    storageProviderKeyLegacy: legacyStorageToken && !blobToken,
    cronSecret: Boolean(process.env.CRON_SECRET),
    ai: Boolean(process.env.AI_PROVIDER_API_KEY),
    modernStorageOnly: isModernStorageOnly(),
  };
}

function buildReleaseSnapshot() {
  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || "local";

  return {
    commitSha,
    shortCommitSha: commitSha === "local" ? "local" : commitSha.slice(0, 7),
    branch: process.env.VERCEL_GIT_COMMIT_REF || process.env.GITHUB_REF_NAME || "local",
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown",
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
  };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const DB_PING_RETRY_DELAY_MS = 200;

/**
 * Serverless Postgres (Neon) can take a moment to wake a suspended compute,
 * which surfaces as a transient PrismaClientInitializationError on the first
 * ping after idle. One short retry avoids reporting a false "unhealthy" for
 * what is really just a cold-start blip, while a genuine outage still fails
 * after the retry.
 */
async function pingDatabaseWithRetry(): Promise<{ retried: boolean }> {
  try {
    await db.$queryRaw`SELECT 1`;
    return { retried: false };
  } catch {
    await delay(DB_PING_RETRY_DELAY_MS);
    await db.$queryRaw`SELECT 1`;
    return { retried: true };
  }
}

function healthResponse(body: unknown, status = 200, release = buildReleaseSnapshot()) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "CDN-Cache-Control": "no-store",
      "Vercel-CDN-Cache-Control": "no-store",
      "X-Revalta-Release": release.shortCommitSha,
      "X-Revalta-Environment": release.environment,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  const isPublic = !user;
  const startedAt = Date.now();
  const release = buildReleaseSnapshot();
  const modernStorageOnly = isModernStorageOnly();
  const env = buildEnvSnapshot();
  const logger = createLogger({
    route: "/api/health",
    requestId: request.headers.get("x-request-id") ?? undefined,
    release: release.shortCommitSha,
    environment: release.environment,
  });

  try {
    const ping = await pingDatabaseWithRetry();
    if (ping.retried) {
      logger.warn("health check database ping succeeded after retry", {
        latencyMs: Date.now() - startedAt,
        audience: isPublic ? "public" : "operations",
      });
    }
    if (isPublic) {
      return healthResponse({
        status: "ok",
        ok: true,
        database: "ok",
        latencyMs: Date.now() - startedAt,
        release,
        modernStorageOnly,
        checkedAt: new Date().toISOString(),
      }, 200, release);
    }
    if (!canViewOperations(user.role)) {
      return healthResponse({ error: "Du saknar behörighet att visa driftstatus" }, 403, release);
    }

    const schema = await getSchemaReadiness();
    const criticalReady = Boolean(
      env.databaseUrl
      && env.directUrl
      && env.jwtSecret
      && env.emailFrom
      && env.emailProvider
      && env.storage
      && env.cronSecret
      && schema.ready,
    );

    if (!schema.ready) {
      logger.warn("health schema readiness degraded", {
        latencyMs: Date.now() - startedAt,
        missingSchemaItems: schema.missing,
      });
    }

    return healthResponse({
      status: schema.ready ? "ok" : "degraded",
      ok: schema.ready,
      database: "ok",
      schema,
      latencyMs: Date.now() - startedAt,
      release,
      modernStorageOnly,
      env,
      readiness: {
        criticalReady,
        storageTokenPresent: Boolean(getStorageToken()),
        prefersBlobToken: env.blobReadWriteToken,
      },
      checkedAt: new Date().toISOString(),
    }, schema.ready ? 200 : 503, release);
  } catch (error) {
    logger.error("health check failed", error, {
      latencyMs: Date.now() - startedAt,
      audience: isPublic ? "public" : "operations",
    });
    return healthResponse({
      status: "error",
      ok: false,
      database: "error",
      latencyMs: Date.now() - startedAt,
      release,
      modernStorageOnly,
      ...(isPublic ? {} : { env }),
      checkedAt: new Date().toISOString(),
    }, 500, release);
  }
}
