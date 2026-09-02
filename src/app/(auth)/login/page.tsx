"use client";

import { readResponseJson } from "@/lib/fetch-json";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { isResident } from "@/lib/permissions";
import { homePathForRole, isStaffOnlyDashboardPath } from "@/lib/resident-access";
import { safeInternalPath } from "@/lib/security";
import { AuthAlert, AuthShell, authButtonClass, authInputClass } from "@/components/auth/auth-shell";

const EMAIL_VERIFICATION_REQUIRED = "EMAIL_VERIFICATION_REQUIRED";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [resendStatus, setResendStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("registered") === "1") {
      setNotice("Kontot är skapat. Kontrollera din e-post och verifiera adressen innan du loggar in.");
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setResendStatus("");
    setVerificationRequired(false);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        const data = await readResponseJson<{ user?: { role?: string } }>(res);
        const params = new URLSearchParams(window.location.search);
        const role = String(data.user?.role || "");
        const fallback = homePathForRole(role);
        const nextPath = safeInternalPath(params.get("next"), fallback);
        router.push(isResident(role) && isStaffOnlyDashboardPath(nextPath) ? fallback : nextPath);
      } else {
        const data = await readResponseJson<{ error?: string; errorCode?: string }>(res);
        setVerificationRequired(data.errorCode === EMAIL_VERIFICATION_REQUIRED);
        setError(data.error || "Inloggningen misslyckades");
      }
    } catch {
      setError("Något gick fel");
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!email || resending) return;
    setResending(true);
    setResendStatus("");
    try {
      const res = await fetch("/api/auth/email-verification/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await readResponseJson<{ message?: string }>(res);
      setResendStatus(data.message || "Om kontot behöver verifieras skickar vi en ny verifieringslänk.");
    } catch {
      setResendStatus("Kunde inte skicka begäran just nu. Försök igen senare.");
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Säker inloggning"
      title="Välkommen tillbaka"
      description="Logga in för att arbeta med organisationens fastigheter, ärenden och arbetsorder."
      footer={
        <>
          Har du inget konto?{" "}
          <Link href="/register" className="font-semibold text-petroleum-700 hover:text-petroleum-900 hover:underline">
            Skapa konto
          </Link>
        </>
      }
    >
      {notice ? (
        <div className="rounded-2xl border border-petroleum-200 bg-petroleum-50 px-4 py-3 text-sm leading-6 text-petroleum-900">
          {notice}
        </div>
      ) : null}
      {error ? <AuthAlert>{error}</AuthAlert> : null}
      {verificationRequired ? (
        <div className="mt-3 rounded-2xl border border-ink-200 bg-white px-4 py-3">
          <p className="text-sm leading-6 text-ink-600">
            Har länken gått ut eller inte kommit fram? Skicka en ny verifieringslänk till adressen ovan.
          </p>
          <button
            type="button"
            onClick={handleResendVerification}
            disabled={resending}
            className="mt-3 text-sm font-semibold text-petroleum-700 hover:text-petroleum-900 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
          >
            {resending ? "Skickar..." : "Skicka ny verifieringslänk"}
          </button>
          {resendStatus ? <p className="mt-2 text-xs leading-5 text-ink-500">{resendStatus}</p> : null}
        </div>
      ) : null}
      <form onSubmit={handleLogin} className="mt-7 space-y-5">
        <div>
          <label htmlFor="login-email" className="block text-sm font-medium text-ink-700">
            E-post
          </label>
          <input
            id="login-email"
            type="email"
            required
            autoComplete="email"
            autoFocus
            className={authInputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="namn@exempel.se"
          />
        </div>
        <div>
          <div className="flex items-center justify-between gap-4">
            <label htmlFor="login-password" className="block text-sm font-medium text-ink-700">
              Lösenord
            </label>
            <Link href="/forgot-password" className="text-sm font-semibold text-petroleum-700 hover:text-petroleum-900 hover:underline">
              Glömt lösenord?
            </Link>
          </div>
          <input
            id="login-password"
            type="password"
            required
            autoComplete="current-password"
            className={authInputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>
        <button type="submit" disabled={loading} className={authButtonClass}>
          {loading ? "Loggar in..." : "Logga in"}
        </button>
      </form>
    </AuthShell>
  );
}
