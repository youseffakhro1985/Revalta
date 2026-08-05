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
      setMessage("E-postadressen är verifierad. Du kan nu fortsätta till inloggningen.");
    } catch {
      setError("Kunde inte kontakta servern");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow="E-postverifiering"
      title="Verifiera din e-postadress"
      description="Bekräfta adressen med den tidsbegränsade engångslänken för att stärka organisationens kontosäkerhet."
      footer={
        <Link href="/login" className="font-semibold text-petroleum-700 hover:text-petroleum-900 hover:underline">
          Till inloggningen
        </Link>
      }
    >
      {error ? <AuthAlert>{error}</AuthAlert> : null}
      {message ? <AuthAlert tone="success">{message}</AuthAlert> : null}
      {!token ? <AuthAlert tone="neutral">Verifieringslänken saknar en giltig token. Öppna länken från e-postmeddelandet igen.</AuthAlert> : null}
      <button type="button" disabled={loading || !token || Boolean(message)} onClick={verify} className={`${authButtonClass} mt-7`}>
        {loading ? "Verifierar..." : message ? "Verifierad" : "Verifiera e-post"}
      </button>
    </AuthShell>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#FAFAF8] p-8"><div className="mx-auto h-[620px] max-w-[1080px] animate-pulse rounded-[28px] border border-sand-200 bg-white" /></main>}>
      <VerifyEmailForm />
    </Suspense>
  );
}
