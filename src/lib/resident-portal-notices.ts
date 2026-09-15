import db from "@/lib/db";
import type { CompanyUser } from "@/lib/current-user";
import { listResidentMatchedLeases } from "@/lib/resident-portal-leases";

const publishedStatuses = new Set(["sent", "paid", "overdue", "cancelled", "issued", "published"]);

function asNumber(value: { toString(): string } | number | null | undefined) {
  return Number(value ?? 0);
}

export type ResidentPortalNoticeLease = {
  id: string;
  leaseNumber: string;
  property: { id: string; name: string; address: string; city: string };
  unit: { id: string; designation: string };
};

export type ResidentPortalNotice = {
  id: string;
  property: { id: string; name: string; address: string; city: string };
  leaseId: string | null;
  tenantName: string;
  unit: string | null;
  period: string;
  dueDate: string;
  status: string;
  baseRent: number;
  indexPercent: number;
  indexedRent: number;
  additions: number;
  deductions: number;
  total: number;
  note: string | null;
  createdAt: string;
};

export type ResidentPortalNoticesState = {
  leases: ResidentPortalNoticeLease[];
  notices: ResidentPortalNotice[];
};

export async function loadResidentPortalNotices(user: CompanyUser): Promise<ResidentPortalNoticesState> {
  const leases = await listResidentMatchedLeases(user.company_id, user.email);
  const leaseIds = leases.map((lease) => lease.id);

  const notices = leaseIds.length === 0
    ? []
    : await db.rentNotice.findMany({
        where: {
          company_id: user.company_id,
          property: { deleted_at: null },
          status: { not: "draft" },
          // Never infer the recipient from a property/unit label. An unlinked
          // notice can belong to another or a former resident of that unit.
          lease_id: { in: leaseIds },
        },
        orderBy: [{ due_date: "desc" }, { id: "desc" }],
        take: 200,
        include: { property: { select: { id: true, name: true, address: true, city: true } } },
      });

  const visible = notices.filter((notice) => (
    publishedStatuses.has(notice.status) || notice.status !== "draft"
  ));

  return {
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
      createdAt: notice.created_at.toISOString(),
    })),
  };
}
