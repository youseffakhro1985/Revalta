import { notFound, redirect } from "next/navigation";
import { ResidentAccount } from "@/components/dashboard/resident-account";
import {
  canAccessResidentPortal,
  getCurrentUser,
  isResident,
  requireCompanyMember,
} from "@/lib/current-user";

export default async function ResidentAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; password?: string; reason?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const member = requireCompanyMember(user);
  if (!member || !canAccessResidentPortal(member.role) || !isResident(member.role)) notFound();

  const query = await searchParams;
  return (
    <ResidentAccount
      initial={{
        id: member.id,
        email: member.email,
        name: member.name,
        role: member.role,
        status: member.status,
        emailVerified: Boolean(member.email_verified_at),
      }}
      saved={query.saved === "1"}
      passwordChanged={query.password === "1"}
      reason={query.reason?.trim() || undefined}
    />
  );
}
