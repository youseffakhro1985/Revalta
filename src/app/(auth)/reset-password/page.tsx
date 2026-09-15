import { ResetPasswordForm } from "./reset-password-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; reason?: string }>;
}) {
  const params = await searchParams;
  return <ResetPasswordForm token={params.token || ""} reason={params.reason || ""} />;
}
