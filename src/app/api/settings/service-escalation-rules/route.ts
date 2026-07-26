import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import {
  ESCALATION_RULE_EVENT,
  getServiceEscalationRules,
  normalizeEscalationRules,
  upsertServiceEscalationRules,
} from "@/lib/service-escalation-rules";

export const dynamic = "force-dynamic";

function canManage(role: string) {
  return role === "owner" || role === "admin";
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const current = await getServiceEscalationRules(user.company_id);
  return NextResponse.json({
    rules: current.rules,
    updatedAt: current.updatedAt,
    canManage: canManage(user.role),
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  if (!canManage(user.role)) return NextResponse.json({ error: "Endast ägare och administratörer får ändra reglerna" }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Ogiltigt innehåll" }, { status: 400 });
  }

  const previous = await getServiceEscalationRules(user.company_id);
  const rules = normalizeEscalationRules(body);

  if (!rules.escalateBlocked && !rules.escalateOverdue) {
    return NextResponse.json({ error: "Minst en eskaleringstyp måste vara aktiverad" }, { status: 400 });
  }
  if (!rules.recipientRoles.length && !rules.includeAssignee) {
    return NextResponse.json({ error: "Minst en mottagare måste vara vald" }, { status: 400 });
  }

  const updatedAt = await upsertServiceEscalationRules(user.company_id, user.id, rules);
  await db.$transaction([
    db.integrationEvent.updateMany({
      where: { company_id: user.company_id, type: ESCALATION_RULE_EVENT, status: "active" },
      data: { status: "superseded" },
    }),
    db.auditLog.create({
      data: {
        company_id: user.company_id,
        actor_user_id: user.id,
        entity_type: "service_escalation_rules",
        entity_id: user.company_id,
        action: "service_escalation_rules.updated",
        metadata: {
          before: previous.rules,
          after: rules,
          storage: "ServiceEscalationRulesSettings",
        },
      },
    }),
  ]);

  return NextResponse.json({
    rules,
    updatedAt,
    canManage: true,
  });
}
