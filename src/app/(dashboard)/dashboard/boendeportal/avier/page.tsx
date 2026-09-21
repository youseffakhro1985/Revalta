import { notFound, redirect } from "next/navigation";
import { ResidentNotices } from "@/components/dashboard/resident-notices";
import {
  canAccessResidentPortal,
  getCurrentUser,
  isResident,
  requireCompanyMember,
} from "@/lib/current-user";
import { loadResidentPortalNotices } from "@/lib/resident-portal-notices";

export default async function ResidentNoticesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const member = requireCompanyMember(user);
  if (!member || !canAccessResidentPortal(member.role) || !isResident(member.role)) notFound();

  const initial = await loadResidentPortalNotices(member);
  const query = await searchParams;
  return <ResidentNotices initial={initial} status={query.status?.trim() || ""} />;
}
