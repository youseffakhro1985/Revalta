"use client";

import { readResponseJson } from "@/lib/fetch-json";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { safeInternalPath } from "@/lib/security";
import { AuthAlert, AuthShell, authButtonClass, authInputClass } from "@/components/auth/auth-shell";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        const params = new URLSearchParams(window.location.search);
        const nextPath = params.get("next");
        router.push(safeInternalPath(nextPath));
      } else {
        const data = await readResponseJson(res);
        setError(data.error || "Inloggningen misslyckades");
      }
    } catch {
      setError("Något gick fel");
    } finally {
      setLoading(false);
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
      {error ? <AuthAlert>{error}</AuthAlert> : null}
      <form onSubmit={handleLogin} className="mt-7 space-y-5">
          <div>
            <label htmlFor="login-email" className="block text-sm font-medium text-ink-700">E-post</label>
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
              <label htmlFor="login-password" className="block text-sm font-medium text-ink-700">Lösenord</label>
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
          <button
            type="submit"
            disabled={loading}
            className={authButtonClass}
          >
            {loading ? "Loggar in..." : "Logga in"}
          </button>
      </form>
    </AuthShell>
  );
}
