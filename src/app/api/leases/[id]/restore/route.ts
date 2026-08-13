import { NextResponse } from "next/server";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { canManageLeases, getCurrentUser } from "@/lib/current-user";
import { isOccupyingLeaseStatus } from "@/lib/leasing";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageLeases(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att återställa avtal" }, { status: 403 });
    }
    if (!user.company_id) {
      return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
    }
    const companyId = user.company_id;

    const { id } = await params;
    const existing = await db.lease.findFirst({
      where: { id, company_id: companyId, deleted_at: { not: null } },
      select: {
        id: true,
        lease_number: true,
        status: true,
        unit_id: true,
        property: { select: { deleted_at: true } },
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Avtalet hittades inte eller är redan aktivt" }, { status: 404 });
    }
    if (existing.property?.deleted_at) {
      return NextResponse.json(
        { error: "Avtalet kan inte återställas eftersom fastigheten är borttagen. Återställ fastigheten först." },
        { status: 409 },
      );
    }

    if (isOccupyingLeaseStatus(existing.status)) {
      const conflict = await db.lease.findFirst({
        where: {
          deleted_at: null,
          unit_id: existing.unit_id,
          company_id: companyId,
          id: { not: existing.id },
          status: { in: ["reserved", "active", "notice"] },
        },
        select: { id: true, lease_number: true },
      });
      if (conflict) {
        return NextResponse.json(
          { error: `Objektet har redan ett pågående avtal (${conflict.lease_number}).` },
          { status: 409 },
        );
      }
    }

    // Restore + audit log in one transaction: an audit-write failure must never
    // leave the lease un-deleted while the caller is told the request failed.
    const restored = await db.$transaction(async (tx) => {
      const restoreResult = await tx.lease.updateMany({
        where: { id: existing.id, company_id: companyId, deleted_at: { not: null } },
        data: { deleted_at: null },
      });
      if (restoreResult.count === 0) return false;

      await writeAuditLog(user, {
        entityType: "lease",
        entityId: existing.id,
        action: "lease.restored",
        metadata: { leaseNumber: existing.lease_number, previousStatus: existing.status, softDelete: true },
      }, tx);
      return true;
    });
    if (!restored) {
      return NextResponse.json({ error: "Avtalet hittades inte eller är redan aktivt" }, { status: 404 });
    }

    return NextResponse.json({ success: true, id: existing.id });
  } catch (error) {
    console.error("Restore lease error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
