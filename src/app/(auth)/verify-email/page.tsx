import VerifyEmailClient from "./verify-email-client";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ token?: string | string[] }>;
};

export default async function VerifyEmailPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  return <VerifyEmailClient token={token} />;
}
