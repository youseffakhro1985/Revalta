import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageCompany, getCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

const ESCALATION_TYPE = "component_service_incident_sla_escalation";

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

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function dateValue(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return noStore({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return noStore({ error: "Användaren saknar organisation" }, { status: 400 });
  if (!canManageCompany(user.role)) {
    return noStore({ error: "Endast ägare och administratörer kan visa SLA-eskaleringar" }, { status: 403 });
  }

  const events = await db.integrationEvent.findMany({
    where: { company_id: user.company_id, type: ESCALATION_TYPE },
    orderBy: { created_at: "desc" },
    take: 100,
    select: { id: true, status: true, payload: true, created_at: true },
  });

  const items = events.map((event) => {
    const payload = record(event.payload);
    const breachType = stringValue(payload?.breachType) === "resolution" ? "resolution" : "acknowledgement";
    const severity = stringValue(payload?.severity) === "critical" ? "critical" : "warning";
    const openedAt = dateValue(payload?.openedAt) || event.created_at;
    const resolvedAt = dateValue(payload?.resolvedAt);
    const openMinutes = numberValue(payload?.openMinutes);
    const thresholdMinutes = numberValue(payload?.thresholdMinutes);

    return {
      id: event.id,
      status: event.status === "resolved" ? "resolved" : "open",
      breachType,
      severity,
      alertId: stringValue(payload?.alertId),
      alertType: stringValue(payload?.alertType),
      openMinutes,
      thresholdMinutes,
      openedAt,
      resolvedAt,
      title: breachType === "resolution"
        ? severity === "critical" ? "Kritisk återställningseskalering" : "Försenad återställning"
        : severity === "critical" ? "Kritisk kvitteringseskalering" : "Försenad kvittering",
      description: breachType === "resolution"
        ? `Incidenten har varit öppen i ${openMinutes} minuter mot återställningsmålet ${thresholdMinutes} minuter.`
        : `Incidenten saknar kvittering efter ${openMinutes} minuter mot målet ${thresholdMinutes} minuter.`,
    };
  });

  const open = items.filter((item) => item.status === "open");
  const resolved = items.filter((item) => item.status === "resolved");

  return noStore({
    escalations: items,
    summary: {
      total: items.length,
      open: open.length,
      critical: open.filter((item) => item.severity === "critical").length,
      acknowledgement: open.filter((item) => item.breachType === "acknowledgement").length,
      resolution: open.filter((item) => item.breachType === "resolution").length,
      resolved: resolved.length,
      oldestOpenMinutes: open.length ? Math.max(...open.map((item) => item.openMinutes)) : 0,
    },
  });
}
