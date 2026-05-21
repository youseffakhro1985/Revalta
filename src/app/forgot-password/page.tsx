"use client";

import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [resetUrl, setResetUrl] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");
    setResetUrl("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Kunde inte skapa återställning");
        return;
      }

      setMessage("Om kontot finns har en återställningslänk skapats.");
      if (data.resetUrl) setResetUrl(data.resetUrl);
    } catch {
      setError("Kunde inte kontakta servern");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <section className="w-full max-w-md rounded-3xl border border-slate-100 bg-white p-8 shadow-card-lg">
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">Säker inloggning</p>
        <h1 className="text-3xl font-extrabold text-slate-950">Återställ lösenord</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          Ange e-postadressen för ditt konto. I mockläge visas länken direkt; med e-postleverantör skickas den via e-post.
        </p>

        {(error || message) && (
          <div className={`mt-6 rounded-2xl border p-4 text-sm font-medium ${error ? "border-danger-500 bg-danger-50 text-danger-600" : "border-success-500 bg-success-50 text-success-600"}`}>
            {error || message}
          </div>
        )}

        {resetUrl && (
          <Link href={resetUrl} className="mt-4 block break-all rounded-2xl border border-brand-100 bg-brand-50 p-4 text-sm font-semibold text-brand-700">
            Öppna återställningslänk
          </Link>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">E-post</label>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="block w-full rounded-xl border border-slate-200 p-3 shadow-inner-sm outline-none focus:border-brand-500"
              placeholder="namn@exempel.se"
            />
          </div>
          <button disabled={loading} className="w-full rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-70">
            {loading ? "Skapar länk..." : "Skicka återställning"}
          </button>
        </form>

        <Link href="/login" className="mt-6 block text-center text-sm font-semibold text-brand-600">
          Tillbaka till inloggning
        </Link>
      </section>
    </main>
  );
}
