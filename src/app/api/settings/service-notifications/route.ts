import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

type ServiceCount = { total: bigint; overdue: bigint };
type Preferences = { enabled: boolean; daysAhead: number; roles: string[]; additionalEmails: string[] };
const allowedRoles = ["owner", "admin", "manager", "property_manager"];
const defaults: Preferences = { enabled: true, daysAhead: 30, roles: [...allowedRoles], additionalEmails: [] };

function appBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return productionHost ? `https://${productionHost}` : "https://www.revalta.se";
}
function canManage(role: string) { return role === "owner" || role === "admin"; }
function normalizeEmail(value: unknown) { return String(value || "").trim().toLowerCase(); }
function parsePreferences(payload: unknown): Preferences {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return defaults;
  const value = payload as Record<string, unknown>;
  const roles = Array.isArray(value.roles) ? value.roles.map(String).filter((role) => allowedRoles.includes(role)) : defaults.roles;
  const additionalEmails = Array.isArray(value.additionalEmails)
    ? Array.from(new Set(value.additionalEmails.map(normalizeEmail).filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))).slice(0, 20)
    : [];
  const days = Number(value.daysAhead);
  return {
    enabled: value.enabled !== false,
    daysAhead: Number.isInteger(days) && days >= 1 && days <= 90 ? days : defaults.daysAhead,
    roles: roles.length ? roles : defaults.roles,
    additionalEmails,
  };
}
async function getPreferences(companyId: string) {
  const event = await db.integrationEvent.findFirst({
    where: { company_id: companyId, type: "component_service_settings", status: "active" },
    orderBy: { created_at: "desc" },
    select: { payload: true, created_at: true },
  });
  return { preferences: parsePreferences(event?.payload), updatedAt: event?.created_at || null };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const stored = await getPreferences(user.company_id);
  const [events, recipients, counts] = await Promise.all([
    db.integrationEvent.findMany({
      where: { company_id: user.company_id, type: { in: ["component_service_digest", "component_service_test"] } },
      orderBy: { created_at: "desc" }, take: 50,
    }),
    db.user.findMany({
      where: { company_id: user.company_id, status: "active", role: { in: stored.preferences.roles } },
      select: { id: true, name: true, email: true, role: true },
      orderBy: [{ role: "asc" }, { name: "asc" }, { email: "asc" }],
    }),
    db.$queryRaw<ServiceCount[]>(Prisma.sql`
      SELECT COUNT(*)::bigint AS "total", COUNT(*) FILTER (WHERE "next_service_at" < NOW())::bigint AS "overdue"
      FROM "PropertyTechnicalAsset"
      WHERE "company_id" = ${user.company_id} AND "next_service_at" IS NOT NULL
        AND "next_service_at" <= NOW() + (${stored.preferences.daysAhead} * INTERVAL '1 day')
        AND COALESCE("status", 'active') NOT IN ('retired', 'removed')
    `),
  ]);
  const statusCounts = events.reduce<Record<string, number>>((summary, event) => {
    summary[event.status] = (summary[event.status] || 0) + 1; return summary;
  }, {});
  return NextResponse.json({
    canManage: canManage(user.role), currentUserEmail: user.email,
    configuration: { cronSecret: Boolean(process.env.CRON_SECRET), emailApiKey: Boolean(process.env.EMAIL_PROVIDER_API_KEY), emailFrom: Boolean(process.env.EMAIL_FROM), appUrl: appBaseUrl() },
    preferences: stored.preferences, preferencesUpdatedAt: stored.updatedAt,
    due: { total: Number(counts[0]?.total || 0), overdue: Number(counts[0]?.overdue || 0) },
    recipients, events, statusCounts,
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  if (!canManage(user.role)) return NextResponse.json({ error: "Endast ägare och administratörer kan ändra inställningarna" }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Ogiltig JSON" }, { status: 400 }); }
  const preferences = parsePreferences(body);
  const raw = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  if (raw.daysAhead !== undefined && (Number(raw.daysAhead) < 1 || Number(raw.daysAhead) > 90 || !Number.isInteger(Number(raw.daysAhead)))) {
    return NextResponse.json({ error: "Aviseringsperioden måste vara mellan 1 och 90 dagar" }, { status: 400 });
  }
  if (Array.isArray(raw.additionalEmails) && raw.additionalEmails.length > 20) return NextResponse.json({ error: "Högst 20 extra mottagare kan anges" }, { status: 400 });
  const previous = await getPreferences(user.company_id);
  await db.$transaction([
    db.integrationEvent.create({ data: { company_id: user.company_id, type: "component_service_settings", status: "active", recipient: `company:${user.company_id}`, payload: { ...preferences, updatedBy: user.id } } }),
    db.auditLog.create({ data: { company_id: user.company_id, actor_user_id: user.id, entity_type: "service_notification_settings", entity_id: user.company_id, action: "updated", metadata: { before: previous.preferences, after: preferences } } }),
  ]);
  return NextResponse.json({ success: true, preferences });
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  if (!canManage(user.role)) return NextResponse.json({ error: "Endast ägare och administratörer kan skicka testutskick" }, { status: 403 });
  const apiKey = process.env.EMAIL_PROVIDER_API_KEY; const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return NextResponse.json({ error: "E-postleverantören är inte fullständigt konfigurerad" }, { status: 503 });
  const event = await db.integrationEvent.create({ data: { company_id: user.company_id, type: "component_service_test", status: "processing", recipient: user.email, payload: { initiatedBy: user.id, appUrl: appBaseUrl() } } });
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [user.email], subject: "Revalta: test av serviceaviseringar", html: `<!doctype html><html lang="sv"><body style="margin:0;background:#f6f3ed;font-family:Arial,sans-serif;color:#22201d"><div style="max-width:640px;margin:0 auto;padding:32px 18px"><div style="overflow:hidden;border:1px solid #e7e1d7;border-radius:18px;background:#fff"><div style="padding:26px 30px;background:#174d45;color:#fff"><div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.8">Revalta</div><h1 style="margin:8px 0 0;font-size:25px">Serviceaviseringarna fungerar</h1></div><div style="padding:28px 30px"><p style="margin:0;line-height:1.6;color:#514e48">Detta är ett testutskick från Revaltas aviseringspanel.</p><p style="margin:24px 0 0"><a href="${appBaseUrl()}/dashboard/installningar/aviseringar" style="display:inline-block;border-radius:10px;background:#174d45;padding:12px 18px;color:#fff;font-weight:700;text-decoration:none">Öppna aviseringspanelen</a></p></div></div></div></body></html>` }),
    });
    const providerResponse = await response.text();
    if (!response.ok) throw new Error(`E-postleverantören svarade ${response.status}: ${providerResponse.slice(0, 300)}`);
    await db.integrationEvent.update({ where: { id: event.id }, data: { status: "sent", payload: { initiatedBy: user.id, providerResponse } } });
    return NextResponse.json({ success: true, recipient: user.email });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Okänt fel";
    await db.integrationEvent.update({ where: { id: event.id }, data: { status: "failed", payload: { initiatedBy: user.id, error: message } } });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
