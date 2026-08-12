import { NextResponse } from "next/server";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { canManageWorkOrderFinance, getCurrentUser } from "@/lib/current-user";
import { readAuditPreviousStatus, resolveRestoredProjectStatus } from "@/lib/soft-delete-restore";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageWorkOrderFinance(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att återställa projekt" }, { status: 403 });
    }
    if (!user.company_id) {
      return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
    }

    const { id } = await params;
    const existing = await db.project.findFirst({
      where: { id, company_id: user.company_id, deleted_at: { not: null } },
      select: {
        id: true,
        name: true,
        status: true,
        property: { select: { deleted_at: true } },
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Projektet hittades inte eller är redan aktivt" }, { status: 404 });
    }
    if (existing.property?.deleted_at) {
      return NextResponse.json(
        { error: "Projektet kan inte återställas eftersom fastigheten är borttagen. Återställ fastigheten först." },
        { status: 409 },
      );
    }

    const deleteAudit = await db.auditLog.findFirst({
      where: {
        company_id: user.company_id,
        entity_type: "project",
        entity_id: existing.id,
        action: "project.deleted",
      },
      orderBy: { created_at: "desc" },
      select: { metadata: true },
    });
    const restoredStatus = resolveRestoredProjectStatus(
      existing.status,
      readAuditPreviousStatus(deleteAudit?.metadata),
    );

    // Restore + audit log in one transaction: an audit-write failure must never
    // leave the project un-deleted while the caller is told the request failed.
    const restored = await db.$transaction(async (tx) => {
      const restoreResult = await tx.project.updateMany({
        where: { id: existing.id, company_id: user.company_id, deleted_at: { not: null } },
        data: { deleted_at: null, status: restoredStatus },
      });
      if (restoreResult.count === 0) return false;

      await writeAuditLog(user, {
        entityType: "project",
        entityId: existing.id,
        action: "project.restored",
        metadata: {
          name: existing.name,
          previousStatus: existing.status,
          status: restoredStatus,
          softDelete: true,
        },
      }, tx);
      return true;
    });
    if (!restored) {
      return NextResponse.json({ error: "Projektet hittades inte eller är redan aktivt" }, { status: 404 });
    }

    return NextResponse.json({ success: true, id: existing.id, status: restoredStatus });
  } catch (error) {
    console.error("Restore project error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
