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

function isObject(value: Prisma.JsonValue | null | undefined): value is Prisma.JsonObject {
  return value !== null && value !== undefined && typeof value === "object" && !Array.isArray(value);
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
  const modern = await db.serviceEscalationRulesSettings.findUnique({
    where: { company_id: companyId },
  });
  if (modern) {
    const roles = Array.isArray(modern.recipient_roles)
      ? modern.recipient_roles.filter((role): role is EscalationRole => typeof role === "string" && ESCALATION_ROLES.includes(role as EscalationRole))
      : DEFAULT_ESCALATION_RULES.recipientRoles;
    return {
      rules: {
        enabled: modern.enabled,
        escalateBlocked: modern.escalate_blocked,
        escalateOverdue: modern.escalate_overdue,
        graceDays: modern.grace_days,
        repeatDays: modern.repeat_days,
        recipientRoles: roles.length ? roles : DEFAULT_ESCALATION_RULES.recipientRoles,
        includeAssignee: modern.include_assignee,
      } satisfies ServiceEscalationRules,
      updatedAt: modern.updated_at.toISOString(),
      source: "table" as const,
    };
  }

  const event = await db.integrationEvent.findFirst({
    where: { company_id: companyId, type: ESCALATION_RULE_EVENT, status: "active" },
    orderBy: { created_at: "desc" },
    select: { payload: true, created_at: true },
  });

  const rawPayload = event?.payload;
  let rulesValue: Prisma.JsonValue | null = null;

  if (isObject(rawPayload)) {
    rulesValue = Object.prototype.hasOwnProperty.call(rawPayload, "rules")
      ? rawPayload.rules ?? null
      : rawPayload;
  } else if (rawPayload !== undefined) {
    rulesValue = rawPayload;
  }

  const rules = normalizeEscalationRules(rulesValue);
  return { rules, updatedAt: event?.created_at.toISOString() ?? null, source: "legacy" as const };
}

export async function upsertServiceEscalationRules(
  companyId: string,
  userId: string,
  rules: ServiceEscalationRules,
) {
  const row = await db.serviceEscalationRulesSettings.upsert({
    where: { company_id: companyId },
    create: {
      company_id: companyId,
      enabled: rules.enabled,
      escalate_blocked: rules.escalateBlocked,
      escalate_overdue: rules.escalateOverdue,
      grace_days: rules.graceDays,
      repeat_days: rules.repeatDays,
      recipient_roles: rules.recipientRoles,
      include_assignee: rules.includeAssignee,
      updated_by_id: userId,
    },
    update: {
      enabled: rules.enabled,
      escalate_blocked: rules.escalateBlocked,
      escalate_overdue: rules.escalateOverdue,
      grace_days: rules.graceDays,
      repeat_days: rules.repeatDays,
      recipient_roles: rules.recipientRoles,
      include_assignee: rules.includeAssignee,
      updated_by_id: userId,
    },
  });
  return row.updated_at.toISOString();
}
