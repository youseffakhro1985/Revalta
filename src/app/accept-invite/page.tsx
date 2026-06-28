"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function AcceptInviteForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function acceptInvite(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/team/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name, password }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Kunde inte acceptera inbjudan");
        return;
      }

      setMessage("Kontot är skapat. Du kan nu logga in i Revalta.");
      setName("");
      setPassword("");
    } catch {
      setError("Kunde inte kontakta servern");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="w-full max-w-md rounded-3xl border border-sand-200 bg-white p-8 shadow-premium-lg">
      <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-petroleum-600">Teaminbjudan</p>
      <h1 className="text-3xl font-semibold tracking-tight text-ink-950">Välkommen till Revalta</h1>
      <p className="mt-3 text-sm leading-6 text-ink-500">Skapa ditt lösenord för att gå med i organisationens arbetsyta.</p>

      {(error || message) && (
        <div className={`mt-6 rounded-2xl border p-4 text-sm font-medium ${error ? "border-danger-500 bg-danger-50 text-danger-600" : "border-success-500 bg-success-50 text-success-600"}`}>
          {error || message}
        </div>
      )}

      <form onSubmit={acceptInvite} className="mt-6 space-y-5">
        <div>
          <label className="mb-1 block text-sm font-medium text-ink-700">Namn</label>
          <input value={name} onChange={(event) => setName(event.target.value)} className="block w-full rounded-xl border border-sand-200 p-3 outline-none focus:border-petroleum-500" placeholder="Förnamn Efternamn" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-ink-700">Lösenord</label>
          <input type="password" minLength={6} required value={password} onChange={(event) => setPassword(event.target.value)} className="block w-full rounded-xl border border-sand-200 p-3 outline-none focus:border-petroleum-500" placeholder="Minst 6 tecken" />
        </div>
        <button disabled={loading || !token} className="w-full rounded-xl bg-petroleum-600 px-5 py-3 font-semibold text-white hover:bg-petroleum-700 disabled:opacity-70">
          {loading ? "Skapar konto..." : "Acceptera inbjudan"}
        </button>
      </form>

      <Link href="/login" className="mt-6 block text-center text-sm font-semibold text-petroleum-600">
        Till inloggning
      </Link>
    </section>
  );
}

export default function AcceptInvitePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-sand-50 p-4">
      <Suspense fallback={<div className="h-64 w-full max-w-md animate-pulse rounded-3xl bg-sand-100" />}>
        <AcceptInviteForm />
      </Suspense>
    </main>
  );
}
