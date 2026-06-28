import db from "@/lib/db";
import { canViewOperations, getCurrentUser } from "@/lib/current-user";
import { NextResponse } from "next/server";

export async function GET() {
  const user = await getCurrentUser();
  const isPublic = !user;
  const startedAt = Date.now();
  const env = {
    databaseUrl: Boolean(process.env.DATABASE_URL),
    directUrl: Boolean(process.env.DIRECT_URL),
    jwtSecret: Boolean(process.env.JWT_SECRET),
    emailFrom: Boolean(process.env.EMAIL_FROM),
    emailProvider: Boolean(process.env.EMAIL_PROVIDER_API_KEY),
    smsProvider: Boolean(process.env.SMS_PROVIDER_API_KEY),
    stripe: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET),
    storage: Boolean(process.env.STORAGE_PROVIDER_KEY),
    ai: Boolean(process.env.AI_PROVIDER_API_KEY),
  };

  try {
    await db.$queryRaw`SELECT 1`;
    if (isPublic) {
      return NextResponse.json({
        status: "ok",
        database: "ok",
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date().toISOString(),
      });
    }
    if (!canViewOperations(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att visa driftstatus" }, { status: 403 });
    }
    return NextResponse.json({
      status: "ok",
      database: "ok",
      latencyMs: Date.now() - startedAt,
      env,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Health check error:", error);
    return NextResponse.json({
      status: "error",
      database: "error",
      latencyMs: Date.now() - startedAt,
      ...(isPublic ? {} : { env }),
      checkedAt: new Date().toISOString(),
    }, { status: 500 });
  }
}
