import { Prisma } from "@prisma/client";
import db from "@/lib/db";
import { getServiceEscalationRules, type ServiceEscalationRules } from "@/lib/service-escalation-rules";
import { listServiceNotificationAssignments } from "@/lib/service-notification-assignments";
import { sqlSoftDeleteGuard } from "@/lib/soft-delete-compat";

type AssetRow = { id: string; company_id: string; property_id: string; component_name: string; next_service_at: Date; property_name: string; property_address: string; property_city: string };
type Assignment = { notificationKey: string; assigneeId?: string | null; assigneeName?: string | null; status?: string; deadline?: string | null; note?: string | null; companyId: string; createdAt: Date };
type CompanyRules = { rules: ServiceEscalationRules; updatedAt: string | null };
type Candidate = { notificationKey: string; asset: AssetRow; assignment: Assignment; reason: "blocked" | "overdue_deadline"; companyRules: CompanyRules; graceAt: Date | null };

function keyFor(row: AssetRow) { return `component-service:${row.id}:${row.next_service_at.toISOString().slice(0, 10)}`; }
function escapeHtml(value: unknown) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#039;"); }
function appBaseUrl() { const value = process.env.NEXT_PUBLIC_APP_URL?.trim(); if (value) return value.replace(/\/$/, ""); const host = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim(); return host ? `https://${host}` : "https://www.revalta.se"; }
function formatDate(value: Date) { return new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeZone: "Europe/Stockholm" }).format(value); }
function repeatBucket(now: Date, repeatDays: number) { return Math.floor(now.getTime() / (repeatDays * 86400000)); }
// Exported for unit testing — a concurrent/retried run racing on the same
// (company_id, dedupe_key) unique constraint must be skipped, not allowed to
// throw an uncaught P2002 that aborts the rest of runServiceEscalations'
// batch.
export function isDedupeKeyConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function sendEscalation(candidate: Candidate, emails: string[]) {
  const apiKey = process.env.EMAIL_PROVIDER_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) throw new Error("E-postleverantören är inte konfigurerad");
  const { asset, assignment, reason } = candidate;
  const deadline = assignment.deadline ? new Date(assignment.deadline) : null;
  const reasonLabel = reason === "blocked" ? "Uppgiften är blockerad" : "Deadline har passerat";
  const href = `${appBaseUrl()}/dashboard/fastigheter/${asset.property_id}/komponenter/${asset.id}`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: emails,
      subject: `Revalta: eskalering för ${asset.component_name}`,
      html: `<!doctype html><html lang="sv"><body style="margin:0;background:#f6f3ed;font-family:Arial,sans-serif;color:#22201d"><div style="max-width:680px;margin:0 auto;padding:32px 18px"><div style="overflow:hidden;border:1px solid #e7e1d7;border-radius:18px;background:#fff"><div style="padding:26px 30px;background:#7b2e26;color:#fff"><div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.85">Revalta · automatisk eskalering</div><h1 style="margin:8px 0 0;font-size:25px">${escapeHtml(reasonLabel)}</h1></div><div style="padding:28px 30px"><h2 style="margin:0;font-size:20px">${escapeHtml(asset.component_name)}</h2><p style="margin:8px 0 0;color:#615d56">${escapeHtml(asset.property_name)} · ${escapeHtml(asset.property_address)}, ${escapeHtml(asset.property_city)}</p><table style="width:100%;margin-top:22px;border-collapse:collapse"><tr><td style="padding:10px 0;color:#77726a">Ansvarig</td><td style="padding:10px 0;text-align:right;font-weight:700">${escapeHtml(assignment.assigneeName || "Ej angiven")}</td></tr><tr><td style="padding:10px 0;border-top:1px solid #eee8de;color:#77726a">Deadline</td><td style="padding:10px 0;border-top:1px solid #eee8de;text-align:right;font-weight:700">${deadline ? escapeHtml(formatDate(deadline)) : "Ingen deadline"}</td></tr></table>${assignment.note ? `<div style="margin-top:22px;border-radius:12px;background:#f7f4ee;padding:16px;color:#514e48"><strong>Kommentar</strong><br>${escapeHtml(assignment.note)}</div>` : ""}<p style="margin:26px 0 0"><a href="${escapeHtml(href)}" style="display:inline-block;border-radius:10px;background:#174d45;padding:12px 18px;color:#fff;font-weight:700;text-decoration:none">Öppna komponenten i Revalta</a></p></div></div></div></body></html>`,
    }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`E-postleverantören svarade ${response.status}: ${body.slice(0, 300)}`);
  return body;
}

async function hasExistingEscalation(companyId: string, dedupeKey: string) {
  const modern = await db.serviceAssignmentEscalation.findUnique({
    where: { company_id_dedupe_key: { company_id: companyId, dedupe_key: dedupeKey } },
    select: { id: true, status: true },
  });
  if (modern && ["processing", "sent"].includes(modern.status)) return true;
  const legacy = await db.integrationEvent.findFirst({
    where: {
      company_id: companyId,
      type: "service_assignment_escalation",
      recipient: dedupeKey,
      status: { in: ["processing", "sent"] },
    },
    select: { id: true },
  });
  return Boolean(legacy);
}

export async function listServiceAssignmentEscalations(companyId: string, take = 100) {
  const [modern, legacy] = await Promise.all([
    db.serviceAssignmentEscalation.findMany({
      where: { company_id: companyId },
      orderBy: { created_at: "desc" },
      take,
    }),
    db.integrationEvent.findMany({
      where: { company_id: companyId, type: "service_assignment_escalation" },
      orderBy: { created_at: "desc" },
      take,
    }),
  ]);
  const modernIds = new Set(modern.map((row) => row.id));
  return [
    ...modern.map((row) => ({
      id: row.id,
      status: row.status,
      recipient: row.dedupe_key,
      payload: row.payload,
      created_at: row.created_at,
      source: "table" as const,
    })),
    ...legacy
      .filter((row) => !modernIds.has(row.id))
      .map((row) => ({
        id: row.id,
        status: row.status,
        recipient: row.recipient,
        payload: row.payload,
        created_at: row.created_at,
        source: "legacy" as const,
      })),
  ]
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
    .slice(0, take);
}

export async function runServiceEscalations(now = new Date()) {
  const dueBefore = new Date(now.getTime() + 30 * 86400000);
  const propertyGuard = await sqlSoftDeleteGuard(db, "Property", "p");
  const [assets, assignmentRows] = await Promise.all([
    db.$queryRaw<AssetRow[]>(Prisma.sql`
      SELECT a."id", a."company_id", a."property_id", a."name" AS "component_name", a."next_service_at",
             p."name" AS "property_name", p."address" AS "property_address", p."city" AS "property_city"
      FROM "PropertyTechnicalAsset" a
      INNER JOIN "Property" p ON p."id" = a."property_id" AND p."company_id" = a."company_id"
      WHERE a."next_service_at" IS NOT NULL
        ${propertyGuard}
        AND a."next_service_at" <= ${dueBefore}
        AND COALESCE(a."status", 'active') NOT IN ('retired', 'removed')
      ORDER BY a."company_id", a."next_service_at" ASC
      LIMIT 5000
    `),
    listServiceNotificationAssignments(),
  ]);

  const companyIds = Array.from(new Set(assets.map((asset) => asset.company_id)));
  const rulesByCompany = new Map<string, CompanyRules>();
  await Promise.all(companyIds.map(async (companyId) => {
    const current = await getServiceEscalationRules(companyId);
    rulesByCompany.set(companyId, current);
  }));
  const assetsByKey = new Map(assets.map((asset) => [keyFor(asset), asset]));
  const latest = new Map<string, Assignment>();
  for (const row of assignmentRows) {
    if (!row.companyId) continue;
    latest.set(`${row.companyId}:${row.notificationKey}`, {
      notificationKey: row.notificationKey,
      assigneeId: row.assigneeId,
      assigneeName: row.assigneeName,
      status: row.status,
      deadline: row.deadline,
      note: row.note,
      companyId: row.companyId,
      createdAt: row.createdAt ?? new Date(row.updatedAt),
    });
  }

  const candidates: Candidate[] = [];
  for (const assignment of latest.values()) {
    const asset = assetsByKey.get(assignment.notificationKey);
    const companyRules = rulesByCompany.get(assignment.companyId);
    const rules = companyRules?.rules;
    if (!asset || !companyRules || !rules?.enabled || asset.company_id !== assignment.companyId || assignment.status === "completed") continue;
    const deadline = assignment.deadline ? new Date(assignment.deadline) : null;
    const graceAt = deadline && !Number.isNaN(deadline.getTime()) ? new Date(deadline.getTime() + rules.graceDays * 86400000) : null;
    const blocked = assignment.status === "blocked" && rules.escalateBlocked;
    const overdue = Boolean(graceAt && graceAt < now && rules.escalateOverdue);
    const reason = blocked ? "blocked" as const : overdue ? "overdue_deadline" as const : null;
    if (reason) candidates.push({ notificationKey: assignment.notificationKey, asset, assignment, reason, companyRules, graceAt });
  }

  const result = { candidates: candidates.length, sent: 0, skipped: 0, failed: 0, disabledCompanies: companyIds.filter((id) => !rulesByCompany.get(id)?.rules.enabled).length };
  for (const candidate of candidates) {
    const rules = candidate.companyRules.rules;
    const bucket = repeatBucket(now, rules.repeatDays);
    const dedupeKey = `service-escalation:${candidate.notificationKey}:${candidate.reason}:${bucket}`;
    if (await hasExistingEscalation(candidate.asset.company_id, dedupeKey)) {
      result.skipped += 1;
      continue;
    }

    const orFilters: Array<{ id: string } | { role: { in: string[] } }> = [];
    if (rules.includeAssignee && candidate.assignment.assigneeId) orFilters.push({ id: candidate.assignment.assigneeId });
    if (rules.recipientRoles.length) orFilters.push({ role: { in: rules.recipientRoles } });
    const users = orFilters.length ? await db.user.findMany({ where: { company_id: candidate.asset.company_id, status: "active", OR: orFilters }, select: { email: true } }) : [];
    const emails = Array.from(new Set(users.map((user) => user.email.trim().toLowerCase()).filter(Boolean)));
    const basePayload = {
      schemaVersion: 2,
      capturedAt: now.toISOString(),
      notificationKey: candidate.notificationKey,
      reason: candidate.reason,
      recipients: emails,
      assigneeId: candidate.assignment.assigneeId || null,
      deadline: candidate.assignment.deadline || null,
      graceAt: candidate.graceAt?.toISOString() || null,
      assignmentStatus: candidate.assignment.status || "assigned",
      assignmentUpdatedAt: candidate.assignment.createdAt.toISOString(),
      componentId: candidate.asset.id,
      componentName: candidate.asset.component_name,
      propertyId: candidate.asset.property_id,
      propertyName: candidate.asset.property_name,
      repeatBucket: bucket,
      rulesSnapshot: {
        enabled: rules.enabled,
        escalateBlocked: rules.escalateBlocked,
        escalateOverdue: rules.escalateOverdue,
        graceDays: rules.graceDays,
        repeatDays: rules.repeatDays,
        recipientRoles: [...rules.recipientRoles],
        includeAssignee: rules.includeAssignee,
        updatedAt: candidate.companyRules.updatedAt,
      },
    };

    if (!emails.length) {
      try {
        await db.serviceAssignmentEscalation.create({
          data: {
            company_id: candidate.asset.company_id,
            dedupe_key: dedupeKey,
            notification_key: candidate.notificationKey,
            status: "skipped",
            reason: candidate.reason,
            payload: { ...basePayload, reasonCode: "no_recipients" },
          },
        });
      } catch (error) {
        // A concurrent/retried run already claimed this dedupeKey (unique
        // constraint on company_id+dedupe_key) — that run owns this
        // candidate now, don't let it abort the rest of this batch.
        if (!isDedupeKeyConflict(error)) throw error;
      }
      result.skipped += 1;
      continue;
    }

    let event: { id: string } | null = null;
    try {
      event = await db.serviceAssignmentEscalation.create({
        data: {
          company_id: candidate.asset.company_id,
          dedupe_key: dedupeKey,
          notification_key: candidate.notificationKey,
          status: "processing",
          reason: candidate.reason,
          payload: basePayload,
        },
      });
    } catch (error) {
      if (!isDedupeKeyConflict(error)) throw error;
      // Same race as above: another invocation already owns this dedupeKey.
      // Skip rather than letting the whole batch fail.
      result.skipped += 1;
      continue;
    }
    try {
      const providerResponse = await sendEscalation(candidate, emails);
      await db.serviceAssignmentEscalation.update({
        where: { id: event.id },
        data: { status: "sent", payload: { ...basePayload, providerResponse } },
      });
      result.sent += 1;
    } catch (error) {
      await db.serviceAssignmentEscalation.update({
        where: { id: event.id },
        data: { status: "failed", payload: { ...basePayload, error: error instanceof Error ? error.message : "Okänt fel" } },
      });
      result.failed += 1;
    }
  }
  return result;
}
