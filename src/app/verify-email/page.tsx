import { VerifyEmailForm } from "./verify-email-form";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; reason?: string }>;
}) {
  const params = await searchParams;
  return <VerifyEmailForm token={params.token || ""} reason={params.reason || ""} />;
}
