"use client";

import { AuthAlert, AuthShell, authButtonClass, authInputClass } from "@/components/auth/auth-shell";
import { readResponseJson } from "@/lib/fetch-json";
import { isValidEmail } from "@/lib/security";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function ForgotPasswordPage() {
  const [hydrated, setHydrated] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setHydrated(true);
    if (new URLSearchParams(window.location.search).get("sent") === "1") {
      setMessage("Om kontot finns skickar vi en återställningslänk.");
    }
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submittedEmail = String(new FormData(event.currentTarget).get("email") || "").trim();
    setMessage("");
    setError("");
    if (!submittedEmail) {
      setError("Ange e-postadressen till kontot.");
      return;
    }
    if (!isValidEmail(submittedEmail)) {
      setError("Ange en giltig e-postadress.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: submittedEmail }),
      });
      const data = await readResponseJson(response);
      setMessage(data.message || "Om kontot finns skickar vi en återställningslänk.");
    } catch {
      setMessage("Om kontot finns skickar vi en återställningslänk.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Kontoåterställning"
      title="Återställ ditt lösenord"
      description="Ange e-postadressen till kontot. Av säkerhetsskäl visar vi aldrig om adressen finns registrerad."
      footer={
        <Link href="/login" className="font-semibold text-petroleum-700 hover:text-petroleum-900 hover:underline">
          Till inloggningen
        </Link>
      }
    >
      {error ? <AuthAlert>{error}</AuthAlert> : null}
      {message ? <AuthAlert tone="neutral">{message}</AuthAlert> : null}
      <form
        id="forgot-password-form"
        method="post"
        action="/api/auth/password-reset/request"
        noValidate
        data-ready={hydrated ? "1" : "0"}
        onSubmit={submit}
        className="mt-7 space-y-5"
      >
        <div>
          <label htmlFor="forgot-password-email" className="block text-sm font-medium text-ink-700">
            E-post
          </label>
          <input
            id="forgot-password-email"
            name="email"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            autoFocus
            className={authInputClass}
            defaultValue=""
            placeholder="namn@exempel.se"
          />
        </div>
        <button type="submit" disabled={loading} aria-busy={loading} className={authButtonClass}>
          {loading ? "Skickar..." : "Skicka återställningslänk"}
        </button>
      </form>
    </AuthShell>
  );
}
