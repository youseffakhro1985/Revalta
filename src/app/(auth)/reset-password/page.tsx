"use client";

import { readResponseJson } from "@/lib/fetch-json";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthAlert, AuthShell, authButtonClass, authInputClass } from "@/components/auth/auth-shell";

function ResetPasswordForm() {
  const token = useSearchParams().get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(""); setMessage("");
    if (password !== confirmPassword) { setError("Lösenorden matchar inte"); return; }
    setLoading(true);
    try {
      const response = await fetch("/api/auth/password-reset/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password, confirmPassword }) });
      const data = await readResponseJson(response);
      if (!response.ok) setError(data.error || "Kunde inte återställa lösenordet");
      else { setMessage(data.message || "Lösenordet är återställt."); setPassword(""); setConfirmPassword(""); }
    } catch { setError("Kunde inte kontakta servern"); }
    finally { setLoading(false); }
  }

  return (
    <AuthShell
      eyebrow="Kontoåterställning"
      title="Välj nytt lösenord"
      description="Länken gäller i 30 minuter och kan användas en gång."
      footer={
        <Link href="/login" className="font-semibold text-petroleum-700 hover:text-petroleum-900 hover:underline">
          Till inloggning
        </Link>
      }
    >
      {error ? <AuthAlert>{error}</AuthAlert> : null}
      {message ? <AuthAlert tone="success">{message}</AuthAlert> : null}
      <form onSubmit={submit} className="mt-7 space-y-5">
        <div>
          <label htmlFor="reset-password" className="block text-sm font-medium text-ink-700">Nytt lösenord</label>
          <input
            id="reset-password"
            type="password"
            required
            minLength={10}
            maxLength={128}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={authInputClass}
          />
        </div>
        <div>
          <label htmlFor="reset-password-confirm" className="block text-sm font-medium text-ink-700">Bekräfta lösenord</label>
          <input
            id="reset-password-confirm"
            type="password"
            required
            minLength={10}
            maxLength={128}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className={authInputClass}
          />
        </div>
        <p className="text-xs text-ink-500">Minst 10 tecken med både bokstav och siffra.</p>
        <button
          disabled={loading || !token || Boolean(message)}
          className={authButtonClass}
        >
          {loading ? "Sparar..." : "Spara nytt lösenord"}
        </button>
      </form>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-sand-50 p-6"><div className="mx-auto mt-24 h-96 w-full max-w-4xl animate-pulse rounded-3xl bg-sand-100" /></main>}>
        <ResetPasswordForm />
    </Suspense>
  );
}
