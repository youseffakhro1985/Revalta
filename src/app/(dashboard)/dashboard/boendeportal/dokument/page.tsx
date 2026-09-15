import { notFound, redirect } from "next/navigation";
import { ResidentDocuments } from "@/components/dashboard/resident-documents";
import {
  canAccessResidentPortal,
  getCurrentUser,
  requireCompanyMember,
} from "@/lib/current-user";
import { loadResidentPortalDocuments } from "@/lib/resident-portal-documents";

export default async function ResidentDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ leaseId?: string; q?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const member = requireCompanyMember(user);
  if (!member || !canAccessResidentPortal(member.role)) notFound();

  const initial = await loadResidentPortalDocuments(member);
  if (!initial) notFound();

  const query = await searchParams;
  const requestedLeaseId = query.leaseId?.trim() || "";
  const selectedLeaseId = initial.leases.some((lease) => lease.id === requestedLeaseId)
    ? requestedLeaseId
    : initial.leases[0]?.id || "";

  return (
    <ResidentDocuments
      initial={initial}
      selectedLeaseId={selectedLeaseId}
      query={query.q?.trim() || ""}
    />
  );
}
