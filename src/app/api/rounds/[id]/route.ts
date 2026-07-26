import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { auditScopedWhere, canManageTickets, getCurrentUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { countDeviations, normalizeChecklist, parseChecklistUpdate } from "@/lib/inspection-round-checklist";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const { id } = await params;
    const round = await db.inspectionRound.findFirst({
      where: { id, company_id: user.company_id },
      select: { id: true, title: true, checklist: true, status: true },
    });
    if (!round) {
      const legacy = await db.auditLog.findFirst({
        where: { ...auditScopedWhere(user), entity_type: "round", id },
        select: { id: true, metadata: true },
      });
      const metadata = (legacy?.metadata || {}) as Record<string, unknown>;
      if (legacy && metadata.storage !== "InspectionRound") {
        return NextResponse.json({
          error: "Ronden finns kvar i äldre lagring. Kör backfill till InspectionRound innan den kan uppdateras.",
        }, { status: 409 });
      }
      return NextResponse.json({ error: "Ronden hittades inte" }, { status: 404 });
    }

    const previous = normalizeChecklist(round.checklist);
    const parsed = parseChecklistUpdate(await request.json().catch(() => null), previous);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: parsed.status });

    const deviations = countDeviations(parsed.data.checklist);
    const status = parsed.data.status
      || (parsed.data.checklist.every((item) => item.completed || item.hasDeviation) ? "completed" : "in_progress");

    const updated = await db.inspectionRound.updateMany({
      where: { id: round.id, company_id: user.company_id },
      data: {
        checklist: parsed.data.checklist as unknown as Prisma.InputJsonValue,
        deviations,
        status,
      },
    });
    if (updated.count === 0) return NextResponse.json({ error: "Ronden hittades inte" }, { status: 404 });

    await writeAuditLog(user, {
      entityType: "round",
      entityId: round.id,
      action: "round.updated",
      metadata: {
        title: round.title,
        previousStatus: round.status,
        status,
        deviations,
        completedCount: parsed.data.checklist.filter((item) => item.completed).length,
        storage: "InspectionRound",
      },
    });

    return NextResponse.json({
      success: true,
      round: {
        id: round.id,
        status,
        deviations,
        checklist: parsed.data.checklist,
      },
    });
  } catch (error) {
    console.error("Update round error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
