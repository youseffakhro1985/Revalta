import db from "@/lib/db";
import { canViewOperations, getCurrentUser } from "@/lib/current-user";
import { isModernStorageOnly } from "@/lib/dual-list";
import { getSchemaReadiness } from "@/lib/schema-readiness";
import { hasStorageConfig } from "@/lib/storage";
import { NextResponse } from "next/server";

export async function GET() {
  const user = await getCurrentUser();
  const isPublic = !user;
  const startedAt = Date.now();
  const release = {
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || "local",
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown",
  };
  const modernStorageOnly = isModernStorageOnly();
  const env = {
    databaseUrl: Boolean(process.env.DATABASE_URL),
    directUrl: Boolean(process.env.DIRECT_URL),
    jwtSecret: Boolean(process.env.JWT_SECRET),
    emailFrom: Boolean(process.env.EMAIL_FROM),
    emailProvider: Boolean(process.env.EMAIL_PROVIDER_API_KEY),
    smsProvider: Boolean(process.env.SMS_PROVIDER_API_KEY),
    stripe: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET),
    storage: hasStorageConfig(),
    ai: Boolean(process.env.AI_PROVIDER_API_KEY),
    modernStorageOnly,
  };

  try {
    await db.$queryRaw`SELECT 1`;
    if (isPublic) {
      return NextResponse.json({
        status: "ok",
        database: "ok",
        latencyMs: Date.now() - startedAt,
        release,
        modernStorageOnly,
        checkedAt: new Date().toISOString(),
      });
    }
    if (!canViewOperations(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att visa driftstatus" }, { status: 403 });
    }

    const schema = await getSchemaReadiness();
    return NextResponse.json({
      status: schema.ready ? "ok" : "degraded",
      database: "ok",
      schema,
      latencyMs: Date.now() - startedAt,
      release,
      env,
      checkedAt: new Date().toISOString(),
    }, { status: schema.ready ? 200 : 503 });
  } catch (error) {
    console.error("Health check error:", error);
    return NextResponse.json({
      status: "error",
      database: "error",
      latencyMs: Date.now() - startedAt,
      release,
      ...(isPublic ? {} : { env }),
      checkedAt: new Date().toISOString(),
    }, { status: 500 });
  }
}
