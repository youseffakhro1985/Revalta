import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canManageTickets } from "@/lib/permissions";
import { analyzeTicket } from "@/lib/ai";

export async function GET() {
  try {
    const user = await getCurrentUser();
    const membership = user?.memberships[0];
    if (!user || !membership) return NextResponse.json({ error: "Obehörig" }, { status: 401 });

    const tickets = await db.ticket.findMany({
      where: {
        companyId: membership.companyId,
        deletedAt: null,
      },
      include: {
        property: true,
        createdBy: {
          select: { firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ tickets });
  } catch (error) {
    console.error("Get tickets error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    const membership = user?.memberships[0];
    if (!user || !membership) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageTickets(membership.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att skapa ärenden" }, { status: 403 });
    }

    const { title, description, propertyText, propertyId } = await request.json();
    if (!title || !description) {
      return NextResponse.json({ error: "Titel och beskrivning krävs" }, { status: 400 });
    }

    const analysis = await analyzeTicket(title, description);

    const ticket = await db.ticket.create({
      data: {
        title: title.trim(),
        description: description.trim(),
        propertyText: typeof propertyText === "string" ? propertyText.trim() || null : null,
        propertyId: propertyId || null,
        companyId: membership.companyId,
        createdById: user.id,
        category: analysis.category,
        priority: analysis.priority,
        aiCategory: analysis.category,
        aiPriority: analysis.priority,
        aiSummary: analysis.summary,
        aiRiskScore: analysis.riskScore,
        aiRiskLevel: analysis.riskLevel,
        aiRecommendedAction: analysis.recommendedAction,
        aiReplyDraft: analysis.replyDraft,
        aiConfidence: analysis.confidence,
        aiNeedsReview: analysis.needsReview,
        aiLastProcessedAt: new Date(),
        history: {
          create: [
            {
              actorUserId: user.id,
              action: "ticket_created",
              newValue: JSON.stringify({ title, priority: analysis.priority, category: analysis.category }),
            },
          ],
        },
      },
    });

    await db.auditLog.create({
      data: {
        actorUserId: user.id,
        companyId: membership.companyId,
        entityType: "ticket",
        entityId: ticket.id,
        action: "ticket_created",
        newValues: JSON.stringify({ title: ticket.title, ai: analysis }),
      },
    });

    return NextResponse.json({ success: true, ticket }, { status: 201 });
  } catch (error) {
    console.error("Create ticket error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
