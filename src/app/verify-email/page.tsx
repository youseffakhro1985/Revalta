"use client";

import { readResponseJson } from "@/lib/fetch-json";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthAlert, AuthShell, authButtonClass } from "@/components/auth/auth-shell";

function VerifyEmailForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function verify() {
    setMessage("");
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/email-verification/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await readResponseJson(response);
      if (!response.ok) {
        setError(data.error || "Kunde inte verifiera e-post");
        return;
      }
      setMessage("E-postadressen är verifierad. Du kan fortsätta till dashboarden.");
    } catch {
      setError("Kunde inte kontakta servern");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Verifiering"
      title="Verifiera e-post"
      description="Bekräfta din e-postadress för högre säkerhet i organisationen."
      footer={
        <Link href="/dashboard" className="font-semibold text-petroleum-700 hover:text-petroleum-900 hover:underline">
          Till dashboard
        </Link>
      }
    >
      {error ? <AuthAlert>{error}</AuthAlert> : null}
      {message ? <AuthAlert tone="success">{message}</AuthAlert> : null}
      <button disabled={loading || !token} onClick={verify} className={`mt-7 ${authButtonClass}`}>
        {loading ? "Verifierar..." : "Verifiera e-post"}
      </button>
    </AuthShell>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-sand-50 p-6"><div className="mx-auto mt-24 h-96 w-full max-w-4xl animate-pulse rounded-3xl bg-sand-100" /></main>}>
        <VerifyEmailForm />
    </Suspense>
  );
}
