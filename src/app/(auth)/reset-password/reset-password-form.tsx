"use client";

import { AuthAlert, AuthShell, authButtonClass, authInputClass } from "@/components/auth/auth-shell";
import { readResponseJson } from "@/lib/fetch-json";
import { passwordPolicyMessage } from "@/lib/security";
import Link from "next/link";
import { useEffect, useState } from "react";

function resetReasonError(reason: string) {
  if (reason === "invalid") return "Länken är ogiltig eller har gått ut";
  if (reason === "mismatch") return "Lösenorden matchar inte";
  if (reason === "policy") return passwordPolicyMessage;
  if (reason === "rate") return "För många försök. Vänta en stund och prova igen.";
  if (reason === "error") return "Kunde inte återställa lösenordet";
  return "";
}

export function ResetPasswordForm({ token, reason }: { token: string; reason: string }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState(() => resetReasonError(reason));
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (loading) return;
    if (window.location.hash !== "#reset-password-form") return;
    document.getElementById("reset-password-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => document.getElementById("reset-password")?.focus(), 0);
  }, [loading]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    const form = new FormData(event.currentTarget);
    const submittedToken = String(form.get("token") || "");
    const password = String(form.get("password") || "");
    const confirmPassword = String(form.get("confirmPassword") || "");
    setError("");
    setMessage("");
    if (password !== confirmPassword) {
      setError("Lösenorden matchar inte");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: submittedToken, password, confirmPassword }),
      });
      const data = await readResponseJson(response);
      if (!response.ok) {
        setError(data.error || "Kunde inte återställa lösenordet");
      } else {
        setMessage(data.message || "Lösenordet är återställt.");
      }
    } catch {
      setError("Kunde inte kontakta servern");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Nytt lösenord"
      title="Välj ett nytt lösenord"
      description="Länken gäller i 30 minuter och kan bara användas en gång. Välj ett unikt lösenord som du inte använder på andra tjänster."
      footer={
        <Link href="/login" className="font-semibold text-petroleum-700 hover:text-petroleum-900 hover:underline">
          Till inloggningen
        </Link>
      }
    >
      {error ? <AuthAlert>{error}</AuthAlert> : null}
      {message ? <AuthAlert tone="success">{message}</AuthAlert> : null}
      {!token ? <AuthAlert tone="neutral">Återställningslänken saknar en giltig token. Begär en ny länk från inloggningssidan.</AuthAlert> : null}
      <form
        id="reset-password-form"
        method="post"
        action="/api/auth/password-reset/confirm"
        noValidate
        data-ready={hydrated ? "1" : "0"}
        onSubmit={submit}
        aria-busy={loading}
        className="scroll-mt-36 mt-7 space-y-5"
      >
        <input type="hidden" name="token" value={token} />
        <div>
          <label htmlFor="reset-password" className="block text-sm font-medium text-ink-700">
            Nytt lösenord
          </label>
          <input
            id="reset-password"
            autoFocus
            name="password"
            type="password"
            required
            minLength={10}
            maxLength={128}
            autoComplete="new-password"
            defaultValue=""
            disabled={loading || !token}
            className={authInputClass}
          />
        </div>
        <div>
          <label htmlFor="reset-password-confirmation" className="block text-sm font-medium text-ink-700">
            Bekräfta lösenord
          </label>
          <input
            id="reset-password-confirmation"
            name="confirmPassword"
            type="password"
            required
            minLength={10}
            maxLength={128}
            autoComplete="new-password"
            defaultValue=""
            className={authInputClass}
          />
        </div>
        <p className="text-xs leading-5 text-ink-500">Minst 10 tecken med både bokstav och siffra.</p>
        <button type="submit" disabled={loading || !token || Boolean(message)} className={authButtonClass}>
          {loading ? "Sparar..." : message ? "Lösenord sparat" : "Spara nytt lösenord"}
        </button>
      </form>
    </AuthShell>
  );
}
