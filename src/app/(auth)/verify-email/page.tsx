"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Verifierar din e-postadress…");

  useEffect(() => {
    let cancelled = false;

    async function verify() {
      if (!token) {
        setStatus("error");
        setMessage("Verifieringslänken saknar en giltig token.");
        return;
      }

      try {
        const response = await fetch("/api/auth/email-verification/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setStatus("error");
          setMessage(data.error || "Verifieringslänken är ogiltig eller har gått ut.");
          return;
        }
        setStatus("success");
        setMessage(data.message || "E-postadressen är verifierad.");
      } catch {
        if (!cancelled) {
          setStatus("error");
          setMessage("Kunde inte kontakta servern. Försök igen senare.");
        }
      }
    }

    void verify();
    return () => { cancelled = true; };
  }, [token]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-sand-50 px-4 py-12">
      <section className="w-full max-w-lg rounded-2xl border border-sand-200/80 bg-white p-8 text-center shadow-premium-sm sm:p-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-petroleum-600">Revalta säkerhet</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-ink-950">Verifiera e-postadress</h1>
        <div className={`mt-6 rounded-xl border p-5 text-sm font-medium ${status === "success" ? "border-success-500 bg-success-50 text-success-600" : status === "error" ? "border-danger-500 bg-danger-50 text-danger-600" : "border-sand-200 bg-sand-50 text-ink-600"}`}>
          {message}
        </div>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href="/dashboard/installningar" className="rounded-lg bg-petroleum-700 px-5 py-3 font-semibold text-white hover:bg-petroleum-800">Öppna inställningar</Link>
          <Link href="/login" className="rounded-lg border border-sand-200 px-5 py-3 font-semibold text-ink-700 hover:bg-sand-50">Till inloggning</Link>
        </div>
      </section>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-sand-50 text-sm text-ink-600">Laddar verifiering…</main>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
