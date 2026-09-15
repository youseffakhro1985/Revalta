"use client";

import { readResponseJson } from "@/lib/fetch-json";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthAlert, AuthShell, authButtonClass } from "@/components/auth/auth-shell";

function verifyReasonError(reason: string) {
  if (reason === "invalid") return "Verifieringslänken är ogiltig eller har gått ut";
  if (reason === "error") return "Något gick fel";
  return "";
}

export function VerifyEmailForm({ token, reason }: { token: string; reason: string }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState(() => verifyReasonError(reason));
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    const submittedToken = String(new FormData(event.currentTarget).get("token") || "");
    setMessage("");
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/email-verification/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: submittedToken }),
      });
      const data = await readResponseJson(response);
      if (!response.ok) {
        setError(data.error || "Kunde inte verifiera e-post");
        return;
      }
      setMessage("E-postadressen är verifierad. Du kan nu fortsätta till inloggningen.");
    } catch {
      setError("Kunde inte kontakta servern");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow="E-postverifiering"
      title="Verifiera din e-postadress"
      description="Bekräfta adressen med den tidsbegränsade engångslänken för att stärka organisationens kontosäkerhet."
      footer={
        <Link href="/login" className="font-semibold text-petroleum-700 hover:text-petroleum-900 hover:underline">
          Till inloggningen
        </Link>
      }
    >
      {error ? <AuthAlert>{error}</AuthAlert> : null}
      {message ? <AuthAlert tone="success">{message}</AuthAlert> : null}
      {!token ? <AuthAlert tone="neutral">Verifieringslänken saknar en giltig token. Öppna länken från e-postmeddelandet igen.</AuthAlert> : null}
      <form
        id="verify-email-form"
        method="post"
        action="/api/auth/email-verification/confirm"
        noValidate
        data-ready={hydrated ? "1" : "0"}
        onSubmit={submit}
        aria-busy={loading}
        className="mt-7"
      >
        <input type="hidden" name="token" value={token} />
        <button type="submit" disabled={loading || !token || Boolean(message)} className={authButtonClass}>
          {loading ? "Verifierar..." : message ? "Verifierad" : "Verifiera e-post"}
        </button>
      </form>
    </AuthShell>
  );
}
