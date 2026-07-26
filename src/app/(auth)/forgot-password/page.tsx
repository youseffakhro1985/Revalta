"use client";

import { readResponseJson } from "@/lib/fetch-json";
import Link from "next/link";
import { useState } from "react";
import { AuthAlert, AuthShell, authButtonClass, authInputClass } from "@/components/auth/auth-shell";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/password-reset/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
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
      title="Glömt lösenord"
      description="Ange e-postadressen till kontot. Av säkerhetsskäl visar vi aldrig om adressen finns registrerad."
      footer={
        <Link href="/login" className="font-semibold text-petroleum-700 hover:text-petroleum-900 hover:underline">
          Tillbaka till inloggning
        </Link>
      }
    >
      {message ? <AuthAlert tone="neutral">{message}</AuthAlert> : null}
      <form onSubmit={submit} className="mt-7 space-y-5">
        <div>
          <label htmlFor="forgot-email" className="block text-sm font-medium text-ink-700">E-post</label>
          <input
            id="forgot-email"
            type="email"
            required
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={authInputClass}
            placeholder="namn@exempel.se"
          />
        </div>
        <button disabled={loading} className={authButtonClass}>
          {loading ? "Skickar..." : "Skicka återställningslänk"}
        </button>
      </form>
    </AuthShell>
  );
}
