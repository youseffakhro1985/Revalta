import db from "@/lib/db";
import {
  canAccessResidentPortal,
  isResident,
  type CompanyUser,
} from "@/lib/current-user";
import {
  listResidentMatchedLeases,
  type ResidentMatchedLease,
} from "@/lib/resident-portal-leases";

export type ResidentPortalLeaseOption = {
  id: string;
  leaseNumber: string;
  property: { id: string; name: string; address: string; city: string };
  unit: { id: string; designation: string };
  holderName: string;
};

export type ResidentPortalBooking = {
  id: string;
  property: { id: string; name: string; address: string; city: string };
  resource: string;
  residentName: string;
  unit: string | null;
  start: string;
  end: string;
  note: string | null;
  status: string;
  createdByMe: boolean;
  createdAt: string;
};

export type ResidentPortalBookingsState = {
  leases: ResidentPortalLeaseOption[];
  bookings: ResidentPortalBooking[];
};

type BookingRow = {
  id: string;
  resource: string;
  resident_name: string;
  unit: string | null;
  start_at: Date;
  end_at: Date;
  note: string | null;
  status: string;
  created_by_id: string;
  created_at: Date;
  property: { id: string; name: string; address: string; city: string };
};

export function mapResidentPortalLease(lease: ResidentMatchedLease): ResidentPortalLeaseOption {
  return {
    id: lease.id,
    leaseNumber: lease.lease_number,
    property: lease.property,
    unit: lease.unit,
    holderName: lease.lease_holder.contact_name || lease.lease_holder.name,
  };
}

export function mapResidentPortalBooking(booking: BookingRow, userId: string): ResidentPortalBooking {
  return {
    id: booking.id,
    property: booking.property,
    resource: booking.resource,
    residentName: booking.resident_name,
    unit: booking.unit,
    start: booking.start_at.toISOString(),
    end: booking.end_at.toISOString(),
    note: booking.note,
    status: booking.status,
    createdByMe: booking.created_by_id === userId,
    createdAt: booking.created_at.toISOString(),
  };
}

export async function loadResidentPortalBookings(
  user: CompanyUser,
): Promise<ResidentPortalBookingsState | null> {
  if (!canAccessResidentPortal(user.role) || !isResident(user.role)) return null;

  const [leases, bookings] = await Promise.all([
    listResidentMatchedLeases(user.company_id, user.email),
    db.booking.findMany({
      where: {
        company_id: user.company_id,
        property: { deleted_at: null },
        // Property/unit labels do not prove who owns a booking: several people
        // can share or successively occupy a unit. Only the authenticated
        // creator is an authoritative resident relationship in this model.
        created_by_id: user.id,
      },
      orderBy: [{ start_at: "desc" }, { id: "desc" }],
      take: 200,
      include: { property: { select: { id: true, name: true, address: true, city: true } } },
    }),
  ]);

  return {
    leases: leases.map(mapResidentPortalLease),
    bookings: bookings.map((booking) => mapResidentPortalBooking(booking, user.id)),
  };
}
