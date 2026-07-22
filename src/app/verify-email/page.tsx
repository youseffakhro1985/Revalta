"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

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
      const data = await response.json();
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
    <section className="w-full max-w-md rounded-3xl border border-sand-200 bg-white p-8 shadow-premium-sm">
      <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-petroleum-600">Verifiering</p>
      <h1 className="font-display text-3xl font-semibold text-ink-950">Verifiera e-post</h1>
      <p className="mt-3 text-sm leading-6 text-ink-500">Bekräfta din e-postadress för högre säkerhet i organisationen.</p>
      {(error || message) && (
        <div role={error ? "alert" : "status"} aria-live="polite" className={`mt-6 rounded-2xl border p-4 text-sm font-medium ${error ? "border-danger-500 bg-danger-50 text-danger-600" : "border-success-500 bg-success-50 text-success-600"}`}>
          {error || message}
        </div>
      )}
      <button disabled={loading || !token} onClick={verify} className="mt-6 w-full rounded-xl bg-petroleum-700 px-5 py-3 font-semibold text-white hover:bg-petroleum-800 disabled:opacity-70">
        {loading ? "Verifierar…" : "Verifiera e-post"}
      </button>
      <Link href="/dashboard" className="mt-6 block text-center text-sm font-semibold text-petroleum-700">Till dashboard</Link>
    </section>
  );
}

export default function VerifyEmailPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-sand-50 p-4">
      <Suspense fallback={<div className="h-64 w-full max-w-md animate-pulse rounded-3xl bg-sand-100" />}>
        <VerifyEmailForm />
      </Suspense>
    </main>
  );
}
