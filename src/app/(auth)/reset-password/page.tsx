"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

export default function ResetPasswordPage() {
  const token = useSearchParams().get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(""); setMessage("");
    if (password !== confirmPassword) { setError("Lösenorden matchar inte"); return; }
    setLoading(true);
    try {
      const response = await fetch("/api/auth/password-reset/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password, confirmPassword }) });
      const data = await response.json();
      if (!response.ok) setError(data.error || "Kunde inte återställa lösenordet");
      else { setMessage(data.message || "Lösenordet är återställt."); setPassword(""); setConfirmPassword(""); }
    } catch { setError("Kunde inte kontakta servern"); }
    finally { setLoading(false); }
  }

  return <main className="flex min-h-screen items-center justify-center bg-sand-50 p-4"><section className="w-full max-w-md rounded-2xl border border-sand-200 bg-white p-8 shadow-premium-sm"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-petroleum-600">Revalta</p><h1 className="mt-3 text-3xl font-semibold text-ink-950">Välj nytt lösenord</h1><p className="mt-3 text-sm text-ink-600">Länken gäller i 30 minuter och kan användas en gång.</p>{error && <div className="mt-5 rounded-xl border border-danger-500 bg-danger-50 p-4 text-sm text-danger-600">{error}</div>}{message && <div className="mt-5 rounded-xl border border-success-500 bg-success-50 p-4 text-sm text-success-600">{message}</div>}<form onSubmit={submit} className="mt-6 space-y-4"><label className="block text-sm font-medium text-ink-700">Nytt lösenord<input type="password" required minLength={10} maxLength={128} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 w-full rounded-xl border border-sand-200 p-3" /></label><label className="block text-sm font-medium text-ink-700">Bekräfta lösenord<input type="password" required minLength={10} maxLength={128} autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="mt-2 w-full rounded-xl border border-sand-200 p-3" /></label><p className="text-xs text-ink-500">Minst 10 tecken med både bokstav och siffra.</p><button disabled={loading || !token || Boolean(message)} className="w-full rounded-xl bg-petroleum-700 px-4 py-3 font-semibold text-white disabled:opacity-60">{loading ? "Sparar..." : "Spara nytt lösenord"}</button></form><Link href="/login" className="mt-6 block text-center text-sm font-medium text-petroleum-700">Till inloggning</Link></section></main>;
}
