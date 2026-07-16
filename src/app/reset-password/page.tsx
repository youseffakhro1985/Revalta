"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Kunde inte byta lösenord");
        return;
      }

      setMessage("Lösenordet är uppdaterat. Du kan logga in igen.");
      setPassword("");
    } catch {
      setError("Kunde inte kontakta servern");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="w-full max-w-md rounded-3xl border border-slate-100 bg-white p-8 shadow-card-lg">
      <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">Nytt lösenord</p>
      <h1 className="text-3xl font-extrabold text-slate-950">Välj nytt lösenord</h1>
      <p className="mt-3 text-sm leading-6 text-slate-500">Länken gäller i 60 minuter och kan bara användas en gång.</p>

      {(error || message) && (
        <div className={`mt-6 rounded-2xl border p-4 text-sm font-medium ${error ? "border-danger-500 bg-danger-50 text-danger-600" : "border-success-500 bg-success-50 text-success-600"}`}>
          {error || message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Nytt lösenord</label>
          <input
            type="password"
            required
            minLength={10}
            maxLength={128}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="block w-full rounded-xl border border-slate-200 p-3 shadow-inner-sm outline-none focus:border-brand-500"
            placeholder="Minst 10 tecken med bokstav och siffra"
          />
        </div>
        <button disabled={loading || !token} className="w-full rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-70">
          {loading ? "Sparar..." : "Uppdatera lösenord"}
        </button>
      </form>

      <Link href="/login" className="mt-6 block text-center text-sm font-semibold text-brand-600">
        Gå till inloggning
      </Link>
    </section>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <Suspense fallback={<div className="h-64 w-full max-w-md animate-pulse rounded-3xl bg-slate-100" />}>
        <ResetPasswordForm />
      </Suspense>
    </main>
  );
}
