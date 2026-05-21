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
    <section className="w-full max-w-md rounded-3xl border border-slate-100 bg-white p-8 shadow-card-lg">
      <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">Verifiering</p>
      <h1 className="text-3xl font-extrabold text-slate-950">Verifiera e-post</h1>
      <p className="mt-3 text-sm leading-6 text-slate-500">Bekräfta din e-postadress för högre säkerhet i organisationen.</p>
      {(error || message) && (
        <div className={`mt-6 rounded-2xl border p-4 text-sm font-medium ${error ? "border-danger-500 bg-danger-50 text-danger-600" : "border-success-500 bg-success-50 text-success-600"}`}>
          {error || message}
        </div>
      )}
      <button disabled={loading || !token} onClick={verify} className="mt-6 w-full rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-70">
        {loading ? "Verifierar..." : "Verifiera e-post"}
      </button>
      <Link href="/dashboard" className="mt-6 block text-center text-sm font-semibold text-brand-600">Till dashboard</Link>
    </section>
  );
}

export default function VerifyEmailPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <Suspense fallback={<div className="h-64 w-full max-w-md animate-pulse rounded-3xl bg-slate-100" />}>
        <VerifyEmailForm />
      </Suspense>
    </main>
  );
}
