import { NextResponse } from "next/server";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { canManageLeases, getCurrentUser } from "@/lib/current-user";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ holderId: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageLeases(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att återställa kontakter" }, { status: 403 });
    }
    if (!user.company_id) {
      return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
    }
    const companyId = user.company_id;

    const { holderId } = await params;
    const existing = await db.leaseHolder.findFirst({
      where: { id: holderId, company_id: companyId, deleted_at: { not: null } },
      select: {
        id: true,
        name: true,
        party_type: true,
        email: true,
        organization_number: true,
        status: true,
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Kontakten hittades inte eller är redan aktiv" }, { status: 404 });
    }

    const duplicate = await db.leaseHolder.findFirst({
      where: {
        deleted_at: null,
        company_id: companyId,
        id: { not: existing.id },
        OR: [
          ...(existing.email
            ? [{ email: { equals: existing.email, mode: "insensitive" as const } }]
            : []),
          ...(existing.organization_number
            ? [{ organization_number: existing.organization_number }]
            : []),
        ],
      },
      select: { id: true, name: true },
    });
    if (duplicate) {
      return NextResponse.json(
        { error: `Kontakten kan inte återställas eftersom ${duplicate.name} redan använder samma e-post eller organisationsnummer.` },
        { status: 409 },
      );
    }

    // Restore + audit log in one transaction: an audit-write failure must never
    // leave the contact un-deleted while the caller is told the request failed.
    const restored = await db.$transaction(async (tx) => {
      const restoreResult = await tx.leaseHolder.updateMany({
        where: { id: existing.id, company_id: companyId, deleted_at: { not: null } },
        data: { deleted_at: null, status: "active" },
      });
      if (restoreResult.count === 0) return false;

      await writeAuditLog(user, {
        entityType: "lease_holder",
        entityId: existing.id,
        action: "lease_holder.restored",
        metadata: {
          name: existing.name,
          partyType: existing.party_type,
          previousStatus: existing.status,
          softDelete: true,
        },
      }, tx);
      return true;
    });
    if (!restored) {
      return NextResponse.json({ error: "Kontakten hittades inte eller är redan aktiv" }, { status: 404 });
    }

    return NextResponse.json({ success: true, id: existing.id });
  } catch (error) {
    console.error("Restore lease holder error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
