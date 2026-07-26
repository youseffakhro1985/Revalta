"use client";

import { readResponseJson } from "@/lib/fetch-json";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthAlert, AuthShell, authButtonClass, authInputClass } from "@/components/auth/auth-shell";

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
      const data = await readResponseJson(response);

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
    <AuthShell
      eyebrow="Teaminbjudan"
      title="Välkommen till Revalta"
      description="Skapa ditt lösenord för att gå med i organisationens arbetsyta."
      footer={
        <Link href="/login" className="font-semibold text-petroleum-700 hover:text-petroleum-900 hover:underline">
          Till inloggning
        </Link>
      }
    >
      {error ? <AuthAlert>{error}</AuthAlert> : null}
      {message ? <AuthAlert tone="success">{message}</AuthAlert> : null}
      <form onSubmit={acceptInvite} className="mt-7 space-y-5">
        <div>
          <label htmlFor="invite-name" className="block text-sm font-medium text-ink-700">Namn</label>
          <input
            id="invite-name"
            required
            minLength={2}
            maxLength={100}
            autoComplete="name"
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={authInputClass}
            placeholder="Förnamn Efternamn"
          />
        </div>
        <div>
          <label htmlFor="invite-password" className="block text-sm font-medium text-ink-700">Lösenord</label>
          <input
            id="invite-password"
            type="password"
            minLength={10}
            maxLength={128}
            required
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={authInputClass}
            placeholder="Minst 10 tecken med bokstav och siffra"
          />
        </div>
        <button disabled={loading || !token} className={authButtonClass}>
          {loading ? "Skapar konto..." : "Acceptera inbjudan"}
        </button>
      </form>
    </AuthShell>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-sand-50 p-6"><div className="mx-auto mt-24 h-96 w-full max-w-4xl animate-pulse rounded-3xl bg-sand-100" /></main>}>
        <AcceptInviteForm />
    </Suspense>
  );
}
