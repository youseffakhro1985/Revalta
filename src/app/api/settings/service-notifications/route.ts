import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

type ServiceCount = { total: bigint; overdue: bigint };

function appBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return productionHost ? `https://${productionHost}` : "https://www.revalta.se";
}

function canManage(role: string) {
  return role === "owner" || role === "admin";
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const [events, recipients, counts] = await Promise.all([
    db.integrationEvent.findMany({
      where: { company_id: user.company_id, type: { in: ["component_service_digest", "component_service_test"] } },
      orderBy: { created_at: "desc" },
      take: 50,
    }),
    db.user.findMany({
      where: {
        company_id: user.company_id,
        status: "active",
        role: { in: ["owner", "admin", "manager", "property_manager"] },
      },
      select: { id: true, name: true, email: true, role: true },
      orderBy: [{ role: "asc" }, { name: "asc" }, { email: "asc" }],
    }),
    db.$queryRaw<ServiceCount[]>(Prisma.sql`
      SELECT COUNT(*)::bigint AS "total",
        COUNT(*) FILTER (WHERE "next_service_at" < NOW())::bigint AS "overdue"
      FROM "PropertyTechnicalAsset"
      WHERE "company_id" = ${user.company_id}
        AND "next_service_at" IS NOT NULL
        AND "next_service_at" <= NOW() + INTERVAL '30 days'
        AND COALESCE("status", 'active') NOT IN ('retired', 'removed')
    `),
  ]);

  const statusCounts = events.reduce<Record<string, number>>((summary, event) => {
    summary[event.status] = (summary[event.status] || 0) + 1;
    return summary;
  }, {});

  return NextResponse.json({
    canManage: canManage(user.role),
    currentUserEmail: user.email,
    configuration: {
      cronSecret: Boolean(process.env.CRON_SECRET),
      emailApiKey: Boolean(process.env.EMAIL_PROVIDER_API_KEY),
      emailFrom: Boolean(process.env.EMAIL_FROM),
      appUrl: appBaseUrl(),
    },
    due: {
      total: Number(counts[0]?.total || 0),
      overdue: Number(counts[0]?.overdue || 0),
    },
    recipients,
    events,
    statusCounts,
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  if (!canManage(user.role)) return NextResponse.json({ error: "Endast ägare och administratörer kan skicka testutskick" }, { status: 403 });

  const apiKey = process.env.EMAIL_PROVIDER_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return NextResponse.json({ error: "E-postleverantören är inte fullständigt konfigurerad" }, { status: 503 });

  const event = await db.integrationEvent.create({
    data: {
      company_id: user.company_id,
      type: "component_service_test",
      status: "processing",
      recipient: user.email,
      payload: { initiatedBy: user.id, appUrl: appBaseUrl() },
    },
  });

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [user.email],
        subject: "Revalta: test av serviceaviseringar",
        html: `<!doctype html><html lang="sv"><body style="margin:0;background:#f6f3ed;font-family:Arial,sans-serif;color:#22201d"><div style="max-width:640px;margin:0 auto;padding:32px 18px"><div style="overflow:hidden;border:1px solid #e7e1d7;border-radius:18px;background:#fff"><div style="padding:26px 30px;background:#174d45;color:#fff"><div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.8">Revalta</div><h1 style="margin:8px 0 0;font-size:25px">Serviceaviseringarna fungerar</h1></div><div style="padding:28px 30px"><p style="margin:0;line-height:1.6;color:#514e48">Detta är ett testutskick från Revaltas aviseringspanel. Den dagliga servicerutinen kan skicka sammanställningar om förfallna och kommande servicepunkter.</p><p style="margin:24px 0 0"><a href="${appBaseUrl()}/dashboard/installningar/aviseringar" style="display:inline-block;border-radius:10px;background:#174d45;padding:12px 18px;color:#fff;font-weight:700;text-decoration:none">Öppna aviseringspanelen</a></p></div></div></div></body></html>`,
      }),
    });
    const providerResponse = await response.text();
    if (!response.ok) throw new Error(`E-postleverantören svarade ${response.status}: ${providerResponse.slice(0, 300)}`);

    await db.integrationEvent.update({
      where: { id: event.id },
      data: { status: "sent", payload: { initiatedBy: user.id, providerResponse } },
    });
    return NextResponse.json({ success: true, recipient: user.email });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Okänt fel";
    await db.integrationEvent.update({
      where: { id: event.id },
      data: { status: "failed", payload: { initiatedBy: user.id, error: message } },
    });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
