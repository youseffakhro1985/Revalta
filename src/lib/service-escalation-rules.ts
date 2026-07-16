import { Prisma } from "@prisma/client";
import db from "@/lib/db";

export const ESCALATION_RULE_EVENT = "service_escalation_rules";
export const ESCALATION_ROLES = ["owner", "admin", "manager", "property_manager"] as const;
export type EscalationRole = (typeof ESCALATION_ROLES)[number];

export type ServiceEscalationRules = {
  enabled: boolean;
  escalateBlocked: boolean;
  escalateOverdue: boolean;
  graceDays: number;
  repeatDays: number;
  recipientRoles: EscalationRole[];
  includeAssignee: boolean;
};

export const DEFAULT_ESCALATION_RULES: ServiceEscalationRules = {
  enabled: true,
  escalateBlocked: true,
  escalateOverdue: true,
  graceDays: 0,
  repeatDays: 1,
  recipientRoles: ["owner", "admin"],
  includeAssignee: true,
};

function isObject(value: Prisma.JsonValue | null): value is Prisma.JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeEscalationRules(value: unknown): ServiceEscalationRules {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const roles = Array.isArray(source.recipientRoles)
    ? source.recipientRoles.filter((role): role is EscalationRole => typeof role === "string" && ESCALATION_ROLES.includes(role as EscalationRole))
    : DEFAULT_ESCALATION_RULES.recipientRoles;

  return {
    enabled: typeof source.enabled === "boolean" ? source.enabled : DEFAULT_ESCALATION_RULES.enabled,
    escalateBlocked: typeof source.escalateBlocked === "boolean" ? source.escalateBlocked : DEFAULT_ESCALATION_RULES.escalateBlocked,
    escalateOverdue: typeof source.escalateOverdue === "boolean" ? source.escalateOverdue : DEFAULT_ESCALATION_RULES.escalateOverdue,
    graceDays: Math.min(30, Math.max(0, Number.isFinite(Number(source.graceDays)) ? Math.trunc(Number(source.graceDays)) : DEFAULT_ESCALATION_RULES.graceDays)),
    repeatDays: Math.min(30, Math.max(1, Number.isFinite(Number(source.repeatDays)) ? Math.trunc(Number(source.repeatDays)) : DEFAULT_ESCALATION_RULES.repeatDays)),
    recipientRoles: roles.length ? Array.from(new Set(roles)) : DEFAULT_ESCALATION_RULES.recipientRoles,
    includeAssignee: typeof source.includeAssignee === "boolean" ? source.includeAssignee : DEFAULT_ESCALATION_RULES.includeAssignee,
  };
}

export async function getServiceEscalationRules(companyId: string) {
  const event = await db.integrationEvent.findFirst({
    where: { company_id: companyId, type: ESCALATION_RULE_EVENT, status: "active" },
    orderBy: { created_at: "desc" },
    select: { payload: true, created_at: true },
  });
  const payload = isObject(event?.payload ?? null) ? event?.payload : null;
  const rules = normalizeEscalationRules(payload && "rules" in payload ? payload.rules : payload);
  return { rules, updatedAt: event?.created_at.toISOString() ?? null };
}
