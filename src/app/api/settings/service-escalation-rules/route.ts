import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import {
  ESCALATION_RULE_EVENT,
  getServiceEscalationRules,
  normalizeEscalationRules,
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
    ...current,
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

  const event = await db.integrationEvent.create({
    data: {
      company_id: user.company_id,
      type: ESCALATION_RULE_EVENT,
      status: "active",
      recipient: user.email,
      payload: {
        rules,
        previousRules: previous.rules,
        changedBy: user.id,
        changedByEmail: user.email,
        version: 1,
      },
    },
  });

  return NextResponse.json({
    rules,
    updatedAt: event.created_at.toISOString(),
    canManage: true,
  });
}
