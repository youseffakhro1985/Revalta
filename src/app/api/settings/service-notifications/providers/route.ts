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

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return noStore({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return noStore({ error: "Användaren saknar organisation" }, { status: 400 });
  if (!canManageCompany(user.role)) {
    return noStore({ error: "Endast ägare och administratörer kan visa providerstatus" }, { status: 403 });
  }

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const events = await db.integrationEvent.findMany({
    where: {
      company_id: user.company_id,
      type: "component_service_digest",
      status: { in: ["sent", "partial", "failed"] },
      created_at: { gte: since },
    },
    orderBy: { created_at: "desc" },
    take: 250,
    select: { id: true, created_at: true, payload: true },
  });

  const stats = new Map<EmailProviderName, {
    sent: number;
    failed: number;
    failoverRecovered: number;
    lastUsedAt: Date | null;
    lastStatus: string | null;
    lastError: string | null;
  }>([
    ["resend", { sent: 0, failed: 0, failoverRecovered: 0, lastUsedAt: null, lastStatus: null, lastError: null }],
    ["postmark", { sent: 0, failed: 0, failoverRecovered: 0, lastUsedAt: null, lastStatus: null, lastError: null }],
  ]);

  let deliveries = 0;
  let failoverRecoveries = 0;

  for (const event of events) {
    const payload = record(event.payload);
    for (const rawDelivery of array(payload?.deliveries)) {
      const delivery = record(rawDelivery);
      if (!delivery) continue;
      deliveries += 1;

      const selectedProvider = providerName(delivery.provider);
      const attempts = array(delivery.providerAttempts).map(record).filter(Boolean) as Record<string, unknown>[];
      const recoveredByFailover = delivery.status === "sent"
        && attempts.length > 1
        && attempts.slice(0, -1).some((attempt) => attempt.ok !== true);

      if (recoveredByFailover) failoverRecoveries += 1;

      for (const attempt of attempts) {
        const provider = providerName(attempt.provider);
        if (!provider) continue;
        const item = stats.get(provider)!;
        const ok = attempt.ok === true;
        if (ok) item.sent += 1;
        else item.failed += 1;
        if (recoveredByFailover && provider === selectedProvider) item.failoverRecovered += 1;
        if (!item.lastUsedAt) {
          item.lastUsedAt = event.created_at;
          item.lastStatus = ok ? "sent" : "failed";
          item.lastError = ok ? null : text(attempt.error) || null;
        }
      }

      if (!attempts.length && selectedProvider) {
        const item = stats.get(selectedProvider)!;
        const sent = delivery.status === "sent";
        if (sent) item.sent += 1;
        else item.failed += 1;
        if (!item.lastUsedAt) {
          item.lastUsedAt = event.created_at;
          item.lastStatus = sent ? "sent" : "failed";
          item.lastError = sent ? null : text(delivery.error) || null;
        }
      }
    }
  }

  const configured = emailTransportStatus();
  const configuredCount = configured.filter((item) => item.configured).length;
  const fromConfigured = Boolean(process.env.EMAIL_FROM?.trim());
  const failoverEnabled = configuredCount > 1;
  const totalFailures = [...stats.values()].reduce((sum, item) => sum + item.failed, 0);

  let recommendation = "Leveransinfrastrukturen är korrekt konfigurerad.";
  let recommendationLevel: "ok" | "warning" | "critical" = "ok";

  if (!fromConfigured) {
    recommendation = "Konfigurera EMAIL_FROM innan serviceaviseringar kan skickas.";
    recommendationLevel = "critical";
  } else if (configuredCount === 0) {
    recommendation = "Konfigurera minst en e-postleverantör för att aktivera utskick.";
    recommendationLevel = "critical";
  } else if (!failoverEnabled) {
    recommendation = "Lägg till en sekundär provider för automatisk reservleverans vid driftstörningar.";
    recommendationLevel = "warning";
  } else if (totalFailures > 0 && failoverRecoveries === 0) {
    recommendation = "Granska senaste providerfel och verifiera domän, avsändare och API-behörigheter.";
    recommendationLevel = "warning";
  } else if (failoverRecoveries > 0) {
    recommendation = `${failoverRecoveries} leveranser har räddats av failover under de senaste 30 dagarna.`;
  }

  return noStore({
    generatedAt: new Date(),
    periodDays: 30,
    fromConfigured,
    failoverEnabled,
    summary: {
      deliveries,
      failoverRecoveries,
      configuredProviders: configuredCount,
      totalFailures,
    },
    recommendation: { level: recommendationLevel, message: recommendation },
    providers: configured.map((item, index) => {
      const providerStats = stats.get(item.provider)!;
      const total = providerStats.sent + providerStats.failed;
      return {
        provider: item.provider,
        priority: index + 1,
        configured: item.configured,
        role: index === 0 ? "primary" : "fallback",
        ...providerStats,
        total,
        successRate: total ? Math.round((providerStats.sent / total) * 1000) / 10 : 100,
      };
    }),
  });
}
