import { NextResponse } from "next/server";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { auditScopedWhere, canManageTickets, getCurrentUser } from "@/lib/current-user";

const allowedStatuses = new Set(["planned", "booked", "completed", "action_required", "cancelled"]);

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
    const inspection = await db.complianceInspection.findFirst({
      where: { id, company_id: user.company_id },
      select: { id: true, title: true, status: true },
    });
    if (!inspection) {
      const legacy = await db.auditLog.findFirst({
        where: { ...auditScopedWhere(user), action: "inspection.created", id },
        select: { id: true, metadata: true },
      });
      const metadata = (legacy?.metadata || {}) as Record<string, unknown>;
      if (legacy && metadata.storage !== "ComplianceInspection") {
        return NextResponse.json({
          error: "Kontrollen finns kvar i äldre lagring. Kör backfill till ComplianceInspection innan den kan uppdateras.",
        }, { status: 409 });
      }
      return NextResponse.json({ error: "Kontrollen hittades inte" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const status = String(body.status || "").trim();
    if (!allowedStatuses.has(status)) {
      return NextResponse.json({ error: "Ogiltig status" }, { status: 400 });
    }

    const note = body.note !== undefined ? String(body.note || "").trim().slice(0, 2000) : undefined;
    const updateResult = await db.complianceInspection.updateMany({
      where: { id: inspection.id, company_id: user.company_id },
      data: {
        status,
        ...(note !== undefined ? { note: note || null } : {}),
      },
    });
    if (updateResult.count === 0) {
      return NextResponse.json({ error: "Kontrollen hittades inte" }, { status: 404 });
    }

    await writeAuditLog(user, {
      entityType: "inspection",
      entityId: inspection.id,
      action: "inspection.status_updated",
      metadata: {
        title: inspection.title,
        previousStatus: inspection.status,
        status,
        storage: "ComplianceInspection",
      },
    });

    return NextResponse.json({ success: true, id: inspection.id, status });
  } catch (error) {
    console.error("Patch inspection error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
