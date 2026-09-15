import { notFound, redirect } from "next/navigation";
import { ResidentPortalHome } from "@/components/dashboard/resident-portal-home";
import { canAccessResidentPortal, getCurrentUser, type CompanyUser } from "@/lib/current-user";
import { loadResidentPortalHome } from "@/lib/resident-portal-home";

export default async function ResidentPortalPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; ref?: string; reason?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.company_id || !canAccessResidentPortal(user.role)) notFound();

  const initial = await loadResidentPortalHome(user as CompanyUser);
  if (!initial) notFound();

  const params = await searchParams;
  return (
    <ResidentPortalHome
      initial={initial}
      createdReference={params.created === "1" ? params.ref?.trim() || undefined : undefined}
      reason={params.reason?.trim() || undefined}
    />
  );
}
