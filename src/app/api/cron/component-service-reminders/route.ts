import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type DueComponent = { id: string; company_id: string; property_id: string; component_name: string; criticality: string | null; next_service_at: Date; property_name: string; property_address: string; property_city: string };
type Recipient = { email: string; name: string | null; role: string };
type Preferences = { enabled: boolean; daysAhead: number; roles: string[]; additionalEmails: string[] };
const allowedRoles = ["owner", "admin", "manager", "property_manager"];
const defaults: Preferences = { enabled: true, daysAhead: 30, roles: [...allowedRoles], additionalEmails: [] };

function escapeHtml(value: unknown) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
function dateKey(date = new Date()) { return date.toISOString().slice(0, 10); }
function formatDate(value: Date) { return new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeZone: "Europe/Stockholm" }).format(value); }
function appBaseUrl() { const configured = process.env.NEXT_PUBLIC_APP_URL?.trim(); if (configured) return configured.replace(/\/$/, ""); const host = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim(); return host ? `https://${host}` : "https://www.revalta.se"; }
function authorized(request: Request) { const secret = process.env.CRON_SECRET; return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`; }
function normalizeEmail(value: unknown) { return String(value || "").trim().toLowerCase(); }
function parsePreferences(payload: unknown): Preferences {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return defaults;
  const value = payload as Record<string, unknown>;
  const roles = Array.isArray(value.roles) ? value.roles.map(String).filter((role) => allowedRoles.includes(role)) : defaults.roles;
  const emails = Array.isArray(value.additionalEmails) ? Array.from(new Set(value.additionalEmails.map(normalizeEmail).filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))).slice(0, 20) : [];
  const days = Number(value.daysAhead);
  return { enabled: value.enabled !== false, daysAhead: Number.isInteger(days) && days >= 1 && days <= 90 ? days : 30, roles: roles.length ? roles : defaults.roles, additionalEmails: emails };
}

async function sendDigest(to: string[], components: DueComponent[], daysAhead: number) {
  const apiKey = process.env.EMAIL_PROVIDER_API_KEY; const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) throw new Error("E-postleverantören är inte konfigurerad");
  const now = new Date(); const overdue = components.filter((item) => item.next_service_at < now).length;
  const rows = components.map((item) => {
    const overdueLabel = item.next_service_at < now ? "Förfallen" : "Kommande";
    const href = `${appBaseUrl()}/dashboard/fastigheter/${item.property_id}/komponenter/${item.id}`;
    return `<tr><td style="padding:12px;border-bottom:1px solid #e7e1d7"><a href="${escapeHtml(href)}" style="color:#174d45;font-weight:700;text-decoration:none">${escapeHtml(item.component_name)}</a><div style="margin-top:4px;color:#6d6a63;font-size:13px">${escapeHtml(item.property_name)} · ${escapeHtml(item.property_address)}, ${escapeHtml(item.property_city)}</div></td><td style="padding:12px;border-bottom:1px solid #e7e1d7;color:#393733">${escapeHtml(formatDate(item.next_service_at))}</td><td style="padding:12px;border-bottom:1px solid #e7e1d7"><span style="display:inline-block;border-radius:999px;background:${overdueLabel === "Förfallen" ? "#fff1f0" : "#f4f0e8"};padding:5px 9px;color:${overdueLabel === "Förfallen" ? "#a4382f" : "#5d564b"};font-size:12px;font-weight:700">${overdueLabel}</span></td></tr>`;
  }).join("");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject: overdue > 0 ? `Revalta: ${overdue} förfallna servicepunkter` : "Revalta: kommande service för tekniska komponenter", html: `<!doctype html><html lang="sv"><body style="margin:0;background:#f6f3ed;font-family:Arial,sans-serif;color:#22201d"><div style="max-width:760px;margin:0 auto;padding:32px 18px"><div style="background:#fff;border:1px solid #e7e1d7;border-radius:18px;overflow:hidden"><div style="padding:28px 30px;background:#174d45;color:#fff"><div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;opacity:.8">Revalta</div><h1 style="margin:8px 0 0;font-size:26px">Serviceöversikt för tekniska komponenter</h1></div><div style="padding:28px 30px"><p style="margin-top:0;line-height:1.6;color:#514e48">Det finns ${components.length} komponenter med service som är förfallen eller ska utföras inom ${daysAhead} dagar. ${overdue > 0 ? `<strong>${overdue} är förfallna.</strong>` : "Inga servicepunkter är förfallna."}</p><table style="width:100%;border-collapse:collapse;margin-top:20px"><thead><tr><th style="padding:10px 12px;text-align:left;color:#77726a;font-size:12px;text-transform:uppercase">Komponent</th><th style="padding:10px 12px;text-align:left;color:#77726a;font-size:12px;text-transform:uppercase">Service</th><th style="padding:10px 12px;text-align:left;color:#77726a;font-size:12px;text-transform:uppercase">Status</th></tr></thead><tbody>${rows}</tbody></table><p style="margin:26px 0 0"><a href="${appBaseUrl()}/dashboard/fastigheter" style="display:inline-block;border-radius:10px;background:#174d45;padding:12px 18px;color:#fff;font-weight:700;text-decoration:none">Öppna Revalta</a></p></div></div></div></body></html>` }),
  });
  const body = await response.text(); if (!response.ok) throw new Error(`E-postleverantören svarade ${response.status}: ${body.slice(0, 300)}`); return body;
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  const now = new Date(); const maxDueBefore = new Date(now.getTime() + 90 * 86400000);
  const [components, settingsEvents] = await Promise.all([
    db.$queryRaw<DueComponent[]>(Prisma.sql`
      SELECT a."id", a."company_id", a."property_id", a."name" AS "component_name", a."criticality", a."next_service_at",
        p."name" AS "property_name", p."address" AS "property_address", p."city" AS "property_city"
      FROM "PropertyTechnicalAsset" a INNER JOIN "Property" p ON p."id" = a."property_id" AND p."company_id" = a."company_id"
      WHERE a."next_service_at" IS NOT NULL AND a."next_service_at" <= ${maxDueBefore}
        AND COALESCE(a."status", 'active') NOT IN ('retired', 'removed')
      ORDER BY a."company_id", a."next_service_at" ASC, a."criticality" DESC
    `),
    db.integrationEvent.findMany({ where: { type: "component_service_settings", status: "active", company_id: { not: null } }, orderBy: { created_at: "desc" }, select: { company_id: true, payload: true } }),
  ]);
  const settings = new Map<string, Preferences>();
  for (const event of settingsEvents) if (event.company_id && !settings.has(event.company_id)) settings.set(event.company_id, parsePreferences(event.payload));
  const grouped = new Map<string, DueComponent[]>();
  for (const component of components) {
    const preference = settings.get(component.company_id) || defaults;
    if (!preference.enabled || component.next_service_at > new Date(now.getTime() + preference.daysAhead * 86400000)) continue;
    const list = grouped.get(component.company_id) || []; list.push(component); grouped.set(component.company_id, list);
  }
  const result = { companies: grouped.size, sent: 0, skipped: 0, failed: 0, components: Array.from(grouped.values()).reduce((sum, list) => sum + list.length, 0) };
  const runDate = dateKey(now);
  for (const [companyId, companyComponents] of grouped) {
    const preference = settings.get(companyId) || defaults;
    const dedupeKey = `component-service-digest:${companyId}:${runDate}`;
    const existing = await db.integrationEvent.findFirst({ where: { company_id: companyId, type: "component_service_digest", recipient: dedupeKey, status: "sent" }, select: { id: true } });
    if (existing) { result.skipped += 1; continue; }
    const recipients = await db.user.findMany({ where: { company_id: companyId, status: "active", role: { in: preference.roles } }, select: { email: true, name: true, role: true }, orderBy: { created_at: "asc" } }) as Recipient[];
    const emails = Array.from(new Set([...recipients.map((item) => normalizeEmail(item.email)), ...preference.additionalEmails].filter(Boolean)));
    if (!emails.length) {
      await db.integrationEvent.create({ data: { company_id: companyId, type: "component_service_digest", status: "skipped", recipient: dedupeKey, payload: { reason: "no_recipients", componentCount: companyComponents.length, settings: preference } } }); result.skipped += 1; continue;
    }
    const event = await db.integrationEvent.create({ data: { company_id: companyId, type: "component_service_digest", status: "processing", recipient: dedupeKey, payload: { recipients: emails, componentCount: companyComponents.length, runDate, settings: preference } } });
    try {
      const providerResponse = await sendDigest(emails, companyComponents, preference.daysAhead);
      await db.integrationEvent.update({ where: { id: event.id }, data: { status: "sent", payload: { recipients: emails, componentCount: companyComponents.length, runDate, settings: preference, providerResponse } } }); result.sent += 1;
    } catch (error) {
      await db.integrationEvent.update({ where: { id: event.id }, data: { status: "failed", payload: { recipients: emails, componentCount: companyComponents.length, runDate, settings: preference, error: error instanceof Error ? error.message : "Okänt fel" } } }); result.failed += 1;
    }
  }
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
