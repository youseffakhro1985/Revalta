import db from "@/lib/db";
import { analyzeTicket } from "@/lib/ai";
import { writeAuditLog } from "@/lib/audit";
import { canManageTickets, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { recordAiEvent } from "@/lib/integrations";
import { NextResponse } from "next/server";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageTickets(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att AI-analysera ärenden" }, { status: 403 });
    }

    const { id } = await params;
    const existing = await db.ticket.findFirst({
      where: { id, deleted_at: null, ...tenantWhere(user), OR: [{ property_id: null }, { property: { deleted_at: null } }] },
      select: { id: true, title: true, description: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Ärendet hittades inte" }, { status: 404 });
    }

    const analysis = await analyzeTicket(existing.description);
    if (!user.company_id) {
      return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
    }

    const updateResult = await db.ticket.updateMany({
      where: { id: existing.id, company_id: user.company_id, deleted_at: null, OR: [{ property_id: null }, { property: { deleted_at: null } }] },
      data: {
        category: analysis.category,
        priority: analysis.priority,
        ai_summary: analysis.summary,
        ai_recommended_action: analysis.recommendedAction,
        ai_confidence: analysis.confidence,
        ai_processed_at: new Date(),
      },
    });
    if (updateResult.count === 0) {
      return NextResponse.json({ error: "Ärendet hittades inte" }, { status: 404 });
    }

    const ticket = await db.ticket.findFirst({
      where: { id: existing.id, company_id: user.company_id, deleted_at: null, OR: [{ property_id: null }, { property: { deleted_at: null } }] },
      select: {
        id: true,
        category: true,
        priority: true,
        ai_summary: true,
        ai_recommended_action: true,
        ai_confidence: true,
        ai_processed_at: true,
      },
    });
    if (!ticket) {
      return NextResponse.json({ error: "Ärendet hittades inte" }, { status: 404 });
    }

    await writeAuditLog(user, {
      entityType: "ticket",
      entityId: ticket.id,
      action: "ticket.ai_analyzed",
      metadata: analysis,
    });
    await recordAiEvent(user, {
      ticketId: ticket.id,
      action: "classification.completed",
      ...analysis,
    });

    return NextResponse.json({ success: true, ticket });
  } catch (error) {
    console.error("Analyze ticket error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
