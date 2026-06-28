import db from "@/lib/db";
import { canManageIntegrations, getCurrentUser } from "@/lib/current-user";
import { NextResponse } from "next/server";

const requiredEnv: Record<string, string[]> = {
  email: ["EMAIL_PROVIDER_API_KEY", "EMAIL_FROM"],
  sms: ["SMS_PROVIDER_API_KEY"],
  stripe: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
  storage: ["STORAGE_PROVIDER_KEY"],
  ai: ["AI_PROVIDER_API_KEY"],
};

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageIntegrations(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att visa integrationer" }, { status: 403 });
    }

    const integrations = Object.entries(requiredEnv).map(([type, envKeys]) => ({
      type,
      configured: envKeys.every((key) => Boolean(process.env[key])),
      requiredEnv: envKeys,
    }));

    const events = await db.integrationEvent.findMany({
      where: user.company_id ? { company_id: user.company_id } : undefined,
      orderBy: { created_at: "desc" },
      take: 50,
    });

    return NextResponse.json({ integrations, events });
  } catch (error) {
    console.error("Get integrations error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
