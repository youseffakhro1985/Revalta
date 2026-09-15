import db from "@/lib/db";
import {
  canAccessResidentPortal,
  canCreateResidentPortalTicket,
  canManageResidentPortal,
  isResident,
  type CompanyUser,
} from "@/lib/current-user";
import { leaseHolderEmailMatch, reporterEmailMatch } from "@/lib/resident-portal-scope";

const activeLeaseStatuses = ["active", "notice"];

export type ResidentPortalHomeLease = {
  id: string;
  lease_number: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  monthly_rent: number;
  property: { id: string; name: string; address: string; city: string };
  unit: { id: string; designation: string; unit_type: string };
  lease_holder: {
    id: string;
    name: string;
    contact_name: string | null;
    email: string | null;
    phone: string | null;
    party_type: string;
  };
};

export type ResidentPortalHomeTicket = {
  id: string;
  public_reference: string | null;
  title: string;
  description: string;
  status: string;
  category: string;
  priority: string;
  reporter_name: string | null;
  reporter_email: string | null;
  reporter_phone: string | null;
  reporter_unit: string | null;
  created_at: string;
  updated_at: string;
  property: { id: string; name: string } | null;
  assigned_to: { id: string; name: string | null; email: string } | null;
};

export type ResidentPortalHomeState = {
  leases: ResidentPortalHomeLease[];
  tickets: ResidentPortalHomeTicket[];
  canManage: boolean;
  canCreate: boolean;
  isResident: boolean;
};

export async function loadResidentPortalHome(user: CompanyUser): Promise<ResidentPortalHomeState | null> {
  if (!canAccessResidentPortal(user.role)) return null;

  const residentView = isResident(user.role);
  const [leases, tickets] = await Promise.all([
    db.lease.findMany({
      where: {
        company_id: user.company_id,
        deleted_at: null,
        status: { in: activeLeaseStatuses },
        property: { deleted_at: null },
        ...(residentView ? { lease_holder: leaseHolderEmailMatch(user.email) } : {}),
      },
      orderBy: [{ property: { name: "asc" } }, { unit: { designation: "asc" } }],
      take: 1000,
      select: {
        id: true,
        lease_number: true,
        status: true,
        start_date: true,
        end_date: true,
        monthly_rent: true,
        property: { select: { id: true, name: true, address: true, city: true } },
        unit: { select: { id: true, designation: true, unit_type: true } },
        lease_holder: { select: { id: true, name: true, contact_name: true, email: true, phone: true, party_type: true } },
      },
    }),
    db.ticket.findMany({
      where: {
        company_id: user.company_id,
        source: "resident_portal",
        deleted_at: null,
        OR: [{ property_id: null }, { property: { deleted_at: null } }],
        ...(residentView ? { reporter_email: reporterEmailMatch(user.email) } : {}),
      },
      orderBy: { created_at: "desc" },
      take: 500,
      select: {
        id: true,
        public_reference: true,
        title: true,
        description: true,
        status: true,
        category: true,
        priority: true,
        reporter_name: true,
        reporter_email: true,
        reporter_phone: true,
        reporter_unit: true,
        created_at: true,
        updated_at: true,
        property: { select: { id: true, name: true } },
        assigned_to: { select: { id: true, name: true, email: true } },
      },
    }),
  ]);

  return {
    leases: leases.map((lease) => ({
      ...lease,
      start_date: lease.start_date?.toISOString() ?? null,
      end_date: lease.end_date?.toISOString() ?? null,
      monthly_rent: Number(lease.monthly_rent),
    })),
    tickets: tickets.map((ticket) => ({
      ...ticket,
      created_at: ticket.created_at.toISOString(),
      updated_at: ticket.updated_at.toISOString(),
    })),
    canManage: canManageResidentPortal(user.role),
    canCreate: canCreateResidentPortalTicket(user.role),
    isResident: residentView,
  };
}
