import db from "@/lib/db";
import { leaseHolderEmailMatch } from "@/lib/resident-portal-scope";

const activeLeaseStatuses = ["active", "notice"] as const;

/** Company + lease-holder email identity. Never accept a client `company_id`. */
export function residentMatchedLeaseWhere(companyId: string, email: string) {
  return {
    company_id: companyId,
    deleted_at: null,
    status: { in: [...activeLeaseStatuses] },
    property: { deleted_at: null },
    lease_holder: leaseHolderEmailMatch(email),
  };
}

const residentMatchedLeaseSelect = {
  id: true,
  lease_number: true,
  property_id: true,
  unit_id: true,
  property: { select: { id: true, name: true, address: true, city: true } },
  unit: { select: { id: true, designation: true } },
  lease_holder: {
    select: {
      id: true,
      name: true,
      contact_name: true,
      email: true,
      phone: true,
    },
  },
} as const;

/** Active leases matched to a resident email via LeaseHolder. */
export async function listResidentMatchedLeases(companyId: string, email: string) {
  return db.lease.findMany({
    where: residentMatchedLeaseWhere(companyId, email),
    orderBy: [{ property: { name: "asc" } }, { unit: { designation: "asc" } }],
    take: 100,
    select: residentMatchedLeaseSelect,
  });
}

/**
 * Resolve one submitted lease id against the signed-in resident identity.
 * Do not use the bounded list helper: a matched lease past `take: 100` must
 * still 404/allow correctly by primary key, never by “first page” membership.
 */
export async function findResidentMatchedLease(companyId: string, email: string, leaseId: string) {
  const id = leaseId.trim();
  if (!id) return null;
  return db.lease.findFirst({
    where: {
      id,
      ...residentMatchedLeaseWhere(companyId, email),
    },
    select: residentMatchedLeaseSelect,
  });
}

export type ResidentMatchedLease = Awaited<ReturnType<typeof listResidentMatchedLeases>>[number];
