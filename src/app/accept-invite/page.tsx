"use client";

import { readResponseJson } from "@/lib/fetch-json";
import { isResident } from "@/lib/permissions";
import { homePathForRole } from "@/lib/resident-access";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

type InvitePreview = {
  email: string;
  name: string | null;
  role: string;
  companyName: string;
  redirectTo: string;
};

function AcceptInviteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(Boolean(token));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoadingPreview(false);
      setError("Inbjudningslänken saknas eller är ogiltig.");
      return;
    }

    let cancelled = false;
    async function loadPreview() {
      setLoadingPreview(true);
      setError("");
      try {
        const response = await fetch(`/api/team/invites/accept?token=${encodeURIComponent(token)}`, {
          cache: "no-store",
        });
        const data = await readResponseJson(response);
        if (cancelled) return;
        if (!response.ok) {
          setPreview(null);
          setError(data.error || "Inbjudan är ogiltig eller har gått ut");
          return;
        }
        setPreview(data.invite);
        setName(data.invite?.name || "");
      } catch {
        if (!cancelled) setError("Kunde inte hämta inbjudan");
      } finally {
        if (!cancelled) setLoadingPreview(false);
      }
    }

    void loadPreview();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const residentInvite = isResident(preview?.role || "");
  const copy = useMemo(() => {
    if (residentInvite) {
      return {
        eyebrow: "Boendeinbjudan",
        title: "Välkommen till boendeportalen",
        description: preview
          ? `Skapa ditt lösenord för att följa felanmälningar och dokument hos ${preview.companyName}.`
          : "Skapa ditt lösenord för att öppna din boendeportal.",
        submit: "Öppna boendeportalen",
        success: "Kontot är skapat. Du skickas vidare till boendeportalen.",
      };
    }
    return {
      eyebrow: "Teaminbjudan",
      title: "Välkommen till Revalta",
      description: preview
        ? `Skapa ditt lösenord för att gå med i ${preview.companyName}.`
        : "Skapa ditt lösenord för att gå med i organisationens arbetsyta.",
      submit: "Acceptera inbjudan",
      success: "Kontot är skapat. Du skickas vidare till arbetsytan.",
    };
  }, [preview, residentInvite]);

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

      setMessage(copy.success);
      const redirectTo = typeof data.redirectTo === "string"
        ? data.redirectTo
        : homePathForRole(String(data.user?.role || ""));
      router.replace(redirectTo);
      router.refresh();
    } catch {
      setError("Kunde inte kontakta servern");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="w-full max-w-md rounded-3xl border border-sand-200 bg-white p-8 shadow-premium-lg">
      <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-petroleum-600">{copy.eyebrow}</p>
      <h1 className="text-3xl font-semibold tracking-tight text-ink-950">{copy.title}</h1>
      <p className="mt-3 text-sm leading-6 text-ink-500">{copy.description}</p>

      {preview ? (
        <div className="mt-5 rounded-2xl border border-sand-200 bg-sand-50 px-4 py-3 text-sm text-ink-600">
          <p className="font-medium text-ink-800">{preview.email}</p>
          <p className="mt-1">{preview.companyName}</p>
          <p className="mt-1">{residentInvite ? "Roll: Boende" : `Roll: ${preview.role}`}</p>
        </div>
      ) : null}

      {(error || message) && (
        <div className={`mt-6 rounded-2xl border p-4 text-sm font-medium ${error ? "border-danger-500 bg-danger-50 text-danger-600" : "border-success-500 bg-success-50 text-success-600"}`}>
          {error || message}
        </div>
      )}

      {loadingPreview ? (
        <div className="mt-6 h-40 animate-pulse rounded-2xl bg-sand-100" />
      ) : preview ? (
        <form onSubmit={acceptInvite} className="mt-6 space-y-5">
          <div>
            <label htmlFor="invite-name" className="mb-1 block text-sm font-medium text-ink-700">Namn</label>
            <input
              id="invite-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="block w-full rounded-xl border border-sand-200 p-3 outline-none focus:border-petroleum-500"
              placeholder="Förnamn Efternamn"
              autoComplete="name"
            />
          </div>
          <div>
            <label htmlFor="invite-password" className="mb-1 block text-sm font-medium text-ink-700">Lösenord</label>
            <input
              id="invite-password"
              type="password"
              minLength={10}
              maxLength={128}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="block w-full rounded-xl border border-sand-200 p-3 outline-none focus:border-petroleum-500"
              placeholder="Minst 10 tecken med bokstav och siffra"
              autoComplete="new-password"
            />
          </div>
          <button
            disabled={loading || !token}
            className="w-full rounded-xl bg-petroleum-600 px-5 py-3 font-semibold text-white hover:bg-petroleum-700 disabled:opacity-70"
          >
            {loading ? "Skapar konto…" : copy.submit}
          </button>
        </form>
      ) : null}

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
