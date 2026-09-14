"use client";

import { AuthAlert, AuthShell, authButtonClass, authInputClass } from "@/components/auth/auth-shell";
import { readResponseJson } from "@/lib/fetch-json";
import { isResident } from "@/lib/permissions";
import { homePathForRole } from "@/lib/resident-access";
import { passwordPolicyMessage } from "@/lib/security";
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
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(Boolean(token));
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    const reason = searchParams.get("reason");
    if (reason === "invalid") setError("Inbjudan är ogiltig eller har gått ut");
    if (reason === "policy") setError(passwordPolicyMessage);
    if (reason === "exists") setError("Det finns redan ett konto med den här e-postadressen. Logga in i stället.");
    if (reason === "rate") setError("För många försök. Vänta en stund och prova igen.");
    if (reason === "error") setError("Något gick fel");
  }, [searchParams]);

  useEffect(() => {
    if (!token) {
      setLoadingPreview(false);
      setError((current) => current || "Inbjudningslänken saknas eller är ogiltig.");
      return;
    }

    let cancelled = false;
    async function loadPreview() {
      setLoadingPreview(true);
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
      } catch {
        if (!cancelled) setError((current) => current || "Kunde inte hämta inbjudan");
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

  async function acceptInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hydrated || loading) return;
    const form = new FormData(event.currentTarget);
    const submittedToken = String(form.get("token") || "").trim();
    const submittedName = String(form.get("name") || "").trim();
    const submittedPassword = String(form.get("password") || "");
    setMessage("");
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/team/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: submittedToken, name: submittedName, password: submittedPassword }),
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
    <AuthShell
      eyebrow={copy.eyebrow}
      title={copy.title}
      description={copy.description}
      footer={
        <Link href="/login" className="font-semibold text-petroleum-700 hover:text-petroleum-900 hover:underline">
          Till inloggningen
        </Link>
      }
    >
      {preview ? (
        <div className="mt-5 rounded-2xl border border-sand-200 bg-sand-50 px-4 py-3 text-sm text-ink-600">
          <p className="font-medium text-ink-800">{preview.email}</p>
          <p className="mt-1">{preview.companyName}</p>
          <p className="mt-1">{residentInvite ? "Roll: Boende" : `Roll: ${preview.role}`}</p>
        </div>
      ) : null}
      {error ? <AuthAlert>{error}</AuthAlert> : null}
      {message ? <AuthAlert tone="success">{message}</AuthAlert> : null}
      {loadingPreview ? <div className="mt-6 h-24 animate-pulse rounded-2xl bg-sand-100" aria-hidden="true" /> : null}
      {token ? (
        <form
          id="accept-invite-form"
          method="post"
          action="/api/team/invites/accept"
          noValidate
          data-ready={hydrated ? "1" : "0"}
          onSubmit={acceptInvite}
          aria-busy={loading}
          className="mt-7 space-y-5"
        >
          <input type="hidden" name="token" value={token} />
          <div>
            <label htmlFor="invite-name" className="block text-sm font-medium text-ink-700">Namn</label>
            <input
              id="invite-name"
              name="name"
              type="text"
              maxLength={120}
              autoComplete="name"
              defaultValue={preview?.name || ""}
              placeholder="Förnamn Efternamn"
              className={authInputClass}
            />
          </div>
          <div>
            <label htmlFor="invite-password" className="block text-sm font-medium text-ink-700">Lösenord</label>
            <input
              id="invite-password"
              name="password"
              type="password"
              required
              minLength={10}
              maxLength={128}
              autoComplete="new-password"
              defaultValue=""
              className={authInputClass}
            />
            <p className="mt-2 text-xs leading-5 text-ink-500">Minst 10 tecken med både bokstav och siffra.</p>
          </div>
          <button type="submit" disabled={!hydrated || loading || Boolean(message)} className={authButtonClass}>
            {loading ? "Skapar konto..." : copy.submit}
          </button>
        </form>
      ) : null}
    </AuthShell>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#FAFAF8] p-8"><div className="mx-auto h-[620px] max-w-[1080px] animate-pulse rounded-[28px] border border-sand-200 bg-white" /></main>}>
      <AcceptInviteForm />
    </Suspense>
  );
}
