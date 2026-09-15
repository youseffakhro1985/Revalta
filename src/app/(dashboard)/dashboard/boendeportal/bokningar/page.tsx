import { notFound, redirect } from "next/navigation";
import { ResidentBookings } from "@/components/dashboard/resident-bookings";
import {
  canAccessResidentPortal,
  getCurrentUser,
  isResident,
  requireCompanyMember,
} from "@/lib/current-user";
import { loadResidentPortalBookings } from "@/lib/resident-portal-bookings";

export default async function ResidentBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; cancelled?: string; reason?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const member = requireCompanyMember(user);
  if (!member || !canAccessResidentPortal(member.role) || !isResident(member.role)) notFound();

  const initial = await loadResidentPortalBookings(member);
  if (!initial) notFound();

  const query = await searchParams;
  return (
    <ResidentBookings
      initial={initial}
      created={query.created === "1"}
      cancelled={query.cancelled === "1"}
      reason={query.reason?.trim() || undefined}
    />
  );
}
