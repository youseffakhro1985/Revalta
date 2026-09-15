import { AcceptInviteForm } from "./accept-invite-form";

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; reason?: string }>;
}) {
  const params = await searchParams;
  return <AcceptInviteForm token={params.token || ""} reason={params.reason || ""} />;
}
