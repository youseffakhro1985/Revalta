import { safeInternalPath } from "@/lib/security";
import { LoginForm } from "./login-form";

type LoginSearchParams = {
  next?: string;
  reason?: string;
  registered?: string;
  reset?: string;
  verified?: string;
  resent?: string;
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<LoginSearchParams>;
}) {
  const params = await searchParams;
  return (
    <LoginForm
      nextPath={safeInternalPath(params.next, "")}
      reason={params.reason || ""}
      registered={params.registered === "1"}
      reset={params.reset === "1"}
      verified={params.verified === "1"}
      resent={params.resent === "1"}
    />
  );
}
