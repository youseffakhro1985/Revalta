import { NextResponse } from "next/server";
import db from "@/lib/db";
import {
  canAccessResidentPortal,
  getCurrentUser,
  isResident,
  requireCompanyMember,
} from "@/lib/current-user";
import { listResidentMatchedLeases } from "@/lib/resident-portal-leases";
import { createLogger } from "@/lib/structured-logger";

const logger = createLogger({ route: "/api/resident-portal/notices" });

const publishedStatuses = new Set(["sent", "paid", "overdue", "cancelled", "issued", "published"]);

function asNumber(value: { toString(): string } | number | null | undefined) {
  return Number(value ?? 0);
}

export async function GET() {
  try {
    const user = requireCompanyMember(await getCurrentUser());
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canAccessResidentPortal(user.role) || !isResident(user.role)) {
      return NextResponse.json({ error: "Endast boende kan använda denna yta" }, { status: 403 });
    }

    const leases = await listResidentMatchedLeases(user.company_id, user.email);
    const leaseIds = leases.map((lease) => lease.id);
    const propertyIds = [...new Set(leases.map((lease) => lease.property_id))];

    const notices = leaseIds.length === 0
      ? []
      : await db.rentNotice.findMany({
          where: {
            company_id: user.company_id,
            property: { deleted_at: null },
            status: { not: "draft" },
            OR: [
              { lease_id: { in: leaseIds } },
              {
                lease_id: null,
                property_id: { in: propertyIds },
                unit: { in: leases.map((lease) => lease.unit.designation).filter(Boolean) },
              },
            ],
          },
          orderBy: { due_date: "desc" },
          take: 200,
          include: { property: { select: { id: true, name: true, address: true, city: true } } },
        });

    const visible = notices.filter((notice) => (
      publishedStatuses.has(notice.status) || notice.status !== "draft"
    ));

    return NextResponse.json({
      leases: leases.map((lease) => ({
        id: lease.id,
        leaseNumber: lease.lease_number,
        property: lease.property,
        unit: lease.unit,
      })),
      notices: visible.map((notice) => ({
        id: notice.id,
        property: notice.property,
        leaseId: notice.lease_id,
        tenantName: notice.tenant_name,
        unit: notice.unit,
        period: notice.period,
        dueDate: notice.due_date.toISOString().slice(0, 10),
        status: notice.status,
        baseRent: asNumber(notice.base_rent),
        indexPercent: asNumber(notice.index_percent),
        indexedRent: asNumber(notice.indexed_rent),
        additions: asNumber(notice.additions),
        deductions: asNumber(notice.deductions),
        total: asNumber(notice.total),
        note: notice.note,
        createdAt: notice.created_at,
      })),
    });
  } catch (error) {
    logger.error("Get resident notices error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
