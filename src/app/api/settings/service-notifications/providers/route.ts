import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageCompany, getCurrentUser } from "@/lib/current-user";
import { emailTransportStatus, type EmailProviderName } from "@/lib/email-transport";

export const dynamic = "force-dynamic";

function noStore(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: { "Cache-Control": "private, no-store", ...(init?.headers || {}) },
  });
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function array(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function providerName(value: unknown): EmailProviderName | null {
  return value === "resend" || value === "postmark" ? value : null;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return noStore({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return noStore({ error: "Användaren saknar organisation" }, { status: 400 });
  if (!canManageCompany(user.role)) {
    return noStore({ error: "Endast ägare och administratörer kan visa providerstatus" }, { status: 403 });
  }

  const events = await db.integrationEvent.findMany({
    where: {
      company_id: user.company_id,
      type: "component_service_digest",
      status: { in: ["sent", "partial", "failed"] },
    },
    orderBy: { created_at: "desc" },
    take: 50,
    select: { id: true, created_at: true, payload: true },
  });

  const stats = new Map<EmailProviderName, { sent: number; failed: number; lastUsedAt: Date | null; lastStatus: string | null }>([
    ["resend", { sent: 0, failed: 0, lastUsedAt: null, lastStatus: null }],
    ["postmark", { sent: 0, failed: 0, lastUsedAt: null, lastStatus: null }],
  ]);

  for (const event of events) {
    const payload = record(event.payload);
    for (const rawDelivery of array(payload?.deliveries)) {
      const delivery = record(rawDelivery);
      if (!delivery) continue;
      const provider = providerName(delivery.provider);
      if (!provider) continue;
      const item = stats.get(provider)!;
      const sent = delivery.status === "sent";
      if (sent) item.sent += 1;
      else item.failed += 1;
      if (!item.lastUsedAt) {
        item.lastUsedAt = event.created_at;
        item.lastStatus = sent ? "sent" : "failed";
      }
    }
  }

  const configured = emailTransportStatus();
  return noStore({
    generatedAt: new Date(),
    fromConfigured: Boolean(process.env.EMAIL_FROM?.trim()),
    failoverEnabled: configured.filter((item) => item.configured).length > 1,
    providers: configured.map((item, index) => ({
      provider: item.provider,
      priority: index + 1,
      configured: item.configured,
      role: index === 0 ? "primary" : "fallback",
      ...stats.get(item.provider),
    })),
  });
}
