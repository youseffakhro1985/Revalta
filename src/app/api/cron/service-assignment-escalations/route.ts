import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type AssetRow = {
  id: string;
  company_id: string;
  property_id: string;
  component_name: string;
  next_service_at: Date;
  property_name: string;
  property_address: string;
  property_city: string;
};

type AssignmentPayload = {
  notificationKey?: string;
  assigneeId?: string | null;
  assigneeName?: string | null;
  status?: string;
  deadline?: string | null;
  note?: string | null;
};

type Assignment = Omit<AssignmentPayload, "notificationKey"> & {
  notificationKey: string;
  companyId: string;
  createdAt: Date;
};

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

function payloadFor(value: Prisma.JsonValue | null): AssignmentPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as AssignmentPayload;
}

function keyFor(row: AssetRow) {
  return `component-service:${row.id}:${row.next_service_at.toISOString().slice(0, 10)}`;
}

function dateKey(value = new Date()) {
  return value.toISOString().slice(0, 10);
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function appBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return productionHost ? `https://${productionHost}` : "https://www.revalta.se";
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "medium",
    timeZone: "Europe/Stockholm",
  }).format(value);
}

async function sendEscalation(args: {
  to: string[];
  asset: AssetRow;
  assignment: Assignment;
  reason: "blocked" | "overdue_deadline";
}) {
  const apiKey = process.env.EMAIL_PROVIDER_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) throw new Error("E-postleverantören är inte konfigurerad");

  const { asset, assignment, reason } = args;
  const deadline = assignment.deadline ? new Date(assignment.deadline) : null;
  const reasonLabel = reason === "blocked" ? "Uppgiften är blockerad" : "Deadline har passerat";
  const href = `${appBaseUrl()}/dashboard/fastigheter/${asset.property_id}/komponenter/${asset.id}`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: args.to,
      subject: `Revalta: eskalering för ${asset.component_name}`,
      html: `<!doctype html><html lang="sv"><body style="margin:0;background:#f6f3ed;font-family:Arial,sans-serif;color:#22201d"><div style="max-width:680px;margin:0 auto;padding:32px 18px"><div style="overflow:hidden;border:1px solid #e7e1d7;border-radius:18px;background:#fff"><div style="padding:26px 30px;background:#7b2e26;color:#fff"><div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.85">Revalta · automatisk eskalering</div><h1 style="margin:8px 0 0;font-size:25px">${escapeHtml(reasonLabel)}</h1></div><div style="padding:28px 30px"><h2 style="margin:0;font-size:20px">${escapeHtml(asset.component_name)}</h2><p style="margin:8px 0 0;color:#615d56">${escapeHtml(asset.property_name)} · ${escapeHtml(asset.property_address)}, ${escapeHtml(asset.property_city)}</p><table style="width:100%;margin-top:22px;border-collapse:collapse"><tr><td style="padding:10px 0;color:#77726a">Ansvarig</td><td style="padding:10px 0;text-align:right;font-weight:700">${escapeHtml(assignment.assigneeName || "Ej angiven")}</td></tr><tr><td style="padding:10px 0;border-top:1px solid #eee8de;color:#77726a">Status</td><td style="padding:10px 0;border-top:1px solid #eee8de;text-align:right;font-weight:700">${assignment.status === "blocked" ? "Blockerad" : "Pågår/tilldelad"}</td></tr><tr><td style="padding:10px 0;border-top:1px solid #eee8de;color:#77726a">Deadline</td><td style="padding:10px 0;border-top:1px solid #eee8de;text-align:right;font-weight:700">${deadline ? escapeHtml(formatDate(deadline)) : "Ingen deadline"}</td></tr><tr><td style="padding:10px 0;border-top:1px solid #eee8de;color:#77726a">Service</td><td style="padding:10px 0;border-top:1px solid #eee8de;text-align:right;font-weight:700">${escapeHtml(formatDate(asset.next_service_at))}</td></tr></table>${assignment.note ? `<div style="margin-top:22px;border-radius:12px;background:#f7f4ee;padding:16px;color:#514e48"><strong>Kommentar</strong><br>${escapeHtml(assignment.note)}</div>` : ""}<p style="margin:26px 0 0"><a href="${escapeHtml(href)}" style="display:inline-block;border-radius:10px;background:#174d45;padding:12px 18px;color:#fff;font-weight:700;text-decoration:none">Öppna komponenten i Revalta</a></p></div></div><p style="margin:18px 0 0;text-align:center;color:#8a857c;font-size:12px">Utskicket har loggats i Revaltas integrationshistorik.</p></div></body></html>`,
    }),
  });

  const body = await response.text();
  if (!response.ok) throw new Error(`E-postleverantören svarade ${response.status}: ${body.slice(0, 300)}`);
  return body;
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Obehörig" }, { status: 401 });

  const now = new Date();
  const dueBefore = new Date(now.getTime() + 30 * 86400000);
  const [assets, assignmentEvents] = await Promise.all([
    db.$queryRaw<AssetRow[]>(Prisma.sql`
      SELECT a."id", a."company_id", a."property_id", a."name" AS "component_name", a."next_service_at",
        p."name" AS "property_name", p."address" AS "property_address", p."city" AS "property_city"
      FROM "PropertyTechnicalAsset" a
      INNER JOIN "Property" p ON p."id" = a."property_id" AND p."company_id" = a."company_id"
      WHERE a."next_service_at" IS NOT NULL
        AND a."next_service_at" <= ${dueBefore}
        AND COALESCE(a."status", 'active') NOT IN ('retired', 'removed')
      ORDER BY a."company_id", a."next_service_at" ASC
      LIMIT 5000
    `),
    db.integrationEvent.findMany({
      where: { type: "service_notification_assignment" },
      orderBy: { created_at: "desc" },
      take: 10000,
      select: { company_id: true, payload: true, created_at: true },
    }),
  ]);

  const assetsByKey = new Map(assets.map((asset) => [keyFor(asset), asset]));
  const latest = new Map<string, Assignment>();
  for (const event of assignmentEvents) {
    const payload = payloadFor(event.payload);
    const key = payload?.notificationKey;
    const companyId = event.company_id;
    if (!key || !companyId) continue;

    const compoundKey = `${companyId}:${key}`;
    if (latest.has(compoundKey)) continue;

    latest.set(compoundKey, {
      ...payload,
      notificationKey: key,
      companyId,
      createdAt: event.created_at,
    });
  }

  const candidates = Array.from(latest.entries()).flatMap(([compoundKey, assignment]) => {
    const notificationKey = compoundKey.slice(assignment.companyId.length + 1);
    const asset = assetsByKey.get(notificationKey);
    if (!asset || asset.company_id !== assignment.companyId || assignment.status === "completed") return [];
    const deadline = assignment.deadline ? new Date(assignment.deadline) : null;
    const deadlinePassed = Boolean(deadline && !Number.isNaN(deadline.getTime()) && deadline < now);
    const reason = assignment.status === "blocked" ? "blocked" as const : deadlinePassed ? "overdue_deadline" as const : null;
    return reason ? [{ notificationKey, asset, assignment, reason }] : [];
  });

  const result = { candidates: candidates.length, sent: 0, skipped: 0, failed: 0 };
  const runDate = dateKey(now);

  for (const candidate of candidates) {
    const dedupeKey = `service-escalation:${candidate.notificationKey}:${candidate.reason}:${runDate}`;
    const existing = await db.integrationEvent.findFirst({
      where: {
        company_id: candidate.asset.company_id,
        type: "service_assignment_escalation",
        recipient: dedupeKey,
        status: { in: ["processing", "sent"] },
      },
      select: { id: true },
    });
    if (existing) {
      result.skipped += 1;
      continue;
    }

    const users = await db.user.findMany({
      where: {
        company_id: candidate.asset.company_id,
        status: "active",
        OR: [
          { id: candidate.assignment.assigneeId || "__none__" },
          { role: { in: ["owner", "admin"] } },
        ],
      },
      select: { email: true },
    });
    const emails = Array.from(new Set(users.map((user) => user.email.trim().toLowerCase()).filter(Boolean)));

    if (!emails.length) {
      await db.integrationEvent.create({
        data: {
          company_id: candidate.asset.company_id,
          type: "service_assignment_escalation",
          status: "skipped",
          recipient: dedupeKey,
          payload: { notificationKey: candidate.notificationKey, reason: candidate.reason, reasonCode: "no_recipients" },
        },
      });
      result.skipped += 1;
      continue;
    }

    const event = await db.integrationEvent.create({
      data: {
        company_id: candidate.asset.company_id,
        type: "service_assignment_escalation",
        status: "processing",
        recipient: dedupeKey,
        payload: {
          notificationKey: candidate.notificationKey,
          reason: candidate.reason,
          recipients: emails,
          assigneeId: candidate.assignment.assigneeId || null,
          deadline: candidate.assignment.deadline || null,
          runDate,
        },
      },
    });

    try {
      const providerResponse = await sendEscalation({
        to: emails,
        asset: candidate.asset,
        assignment: candidate.assignment,
        reason: candidate.reason,
      });
      await db.integrationEvent.update({
        where: { id: event.id },
        data: {
          status: "sent",
          payload: {
            notificationKey: candidate.notificationKey,
            reason: candidate.reason,
            recipients: emails,
            assigneeId: candidate.assignment.assigneeId || null,
            deadline: candidate.assignment.deadline || null,
            runDate,
            providerResponse,
          },
        },
      });
      result.sent += 1;
    } catch (error) {
      await db.integrationEvent.update({
        where: { id: event.id },
        data: {
          status: "failed",
          payload: {
            notificationKey: candidate.notificationKey,
            reason: candidate.reason,
            recipients: emails,
            runDate,
            error: error instanceof Error ? error.message : "Okänt fel",
          },
        },
      });
      result.failed += 1;
    }
  }

  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
