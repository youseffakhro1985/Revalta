"use client";

import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/password-reset/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const data = await response.json();
      setMessage(data.message || "Om kontot finns skickar vi en återställningslänk.");
    } catch {
      setMessage("Om kontot finns skickar vi en återställningslänk.");
    } finally {
      setLoading(false);
    }
  }

  return <main className="flex min-h-screen items-center justify-center bg-sand-50 p-4"><section className="w-full max-w-md rounded-2xl border border-sand-200 bg-white p-8 shadow-premium-sm"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-petroleum-600">Revalta</p><h1 className="mt-3 text-3xl font-semibold text-ink-950">Glömt lösenord</h1><p className="mt-3 text-sm text-ink-600">Ange e-postadressen till kontot. Av säkerhetsskäl visar vi aldrig om adressen finns registrerad.</p>{message && <div role="status" aria-live="polite" className="mt-5 rounded-xl border border-sand-200 bg-sand-50 p-4 text-sm text-ink-700">{message}</div>}<form onSubmit={submit} className="mt-6 space-y-4"><label className="block text-sm font-medium text-ink-700">E-post<input type="email" required autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 w-full rounded-xl border border-sand-200 p-3" /></label><button disabled={loading} className="w-full rounded-xl bg-petroleum-700 px-4 py-3 font-semibold text-white disabled:opacity-60">{loading ? "Skickar…" : "Skicka återställningslänk"}</button></form><Link href="/login" className="mt-6 block text-center text-sm font-medium text-petroleum-700">Tillbaka till inloggning</Link></section></main>;
}
