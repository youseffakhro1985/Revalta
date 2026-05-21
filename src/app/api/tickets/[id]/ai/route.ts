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
      where: { id, ...tenantWhere(user) },
      select: { id: true, title: true, description: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Ärendet hittades inte" }, { status: 404 });
    }

    const analysis = await analyzeTicket(existing.description);
    const ticket = await db.ticket.update({
      where: { id: existing.id },
      data: {
        category: analysis.category,
        priority: analysis.priority,
        ai_summary: analysis.summary,
        ai_recommended_action: analysis.recommendedAction,
        ai_confidence: analysis.confidence,
        ai_processed_at: new Date(),
      },
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
