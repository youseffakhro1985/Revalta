import db from "@/lib/db";
import { leaseHolderEmailMatch } from "@/lib/resident-portal-scope";

const activeLeaseStatuses = ["active", "notice"] as const;

/** Active leases matched to a resident email via LeaseHolder. */
export async function listResidentMatchedLeases(companyId: string, email: string) {
  return db.lease.findMany({
    where: {
      company_id: companyId,
      deleted_at: null,
      status: { in: [...activeLeaseStatuses] },
      property: { deleted_at: null },
      lease_holder: leaseHolderEmailMatch(email),
    },
    orderBy: [{ property: { name: "asc" } }, { unit: { designation: "asc" } }],
    take: 100,
    select: {
      id: true,
      lease_number: true,
      property_id: true,
      unit_id: true,
      property: { select: { id: true, name: true, address: true, city: true } },
      unit: { select: { id: true, designation: true } },
      lease_holder: { select: { name: true, contact_name: true } },
    },
  });
}

export type ResidentMatchedLease = Awaited<ReturnType<typeof listResidentMatchedLeases>>[number];
