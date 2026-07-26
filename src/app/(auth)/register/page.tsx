"use client";

import { readResponseJson } from "@/lib/fetch-json";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AuthAlert, AuthShell, authButtonClass, authInputClass } from "@/components/auth/auth-shell";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, companyName, email, password }),
      });
      if (res.ok) {
        router.push("/login");
      } else {
        const data = await readResponseJson(res);
        setError(data.error || "Kunde inte skapa konto");
      }
    } catch {
      setError("Något gick fel");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Ny organisation"
      title="Skapa er arbetsyta"
      description="Registrera organisationens första administratör och börja konfigurera Revalta för er förvaltning."
      footer={
        <>
          Har du redan ett konto?{" "}
          <Link href="/login" className="font-semibold text-petroleum-700 hover:text-petroleum-900 hover:underline">
            Logga in
          </Link>
        </>
      }
    >
      {error ? <AuthAlert>{error}</AuthAlert> : null}
      <form onSubmit={handleRegister} className="mt-7 space-y-5">
          <div>
            <label htmlFor="register-name" className="block text-sm font-medium text-ink-700">Ditt namn</label>
            <input
              id="register-name"
              type="text"
              required
              minLength={2}
              maxLength={100}
              autoComplete="name"
              autoFocus
              className={authInputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Förnamn Efternamn"
            />
          </div>
          <div>
            <label htmlFor="register-company" className="block text-sm font-medium text-ink-700">Organisation</label>
            <input
              id="register-company"
              type="text"
              required
              minLength={2}
              maxLength={160}
              autoComplete="organization"
              className={authInputClass}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Exempel Fastighetsförvaltning"
            />
          </div>
          <div>
            <label htmlFor="register-email" className="block text-sm font-medium text-ink-700">E-post</label>
            <input
              id="register-email"
              type="email"
              required
              autoComplete="email"
              className={authInputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="namn@exempel.se"
            />
          </div>
          <div>
            <label htmlFor="register-password" className="block text-sm font-medium text-ink-700">Lösenord</label>
            <input
              id="register-password"
              type="password"
              required
              minLength={10}
              maxLength={128}
              autoComplete="new-password"
              className={authInputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
            <p className="mt-2 text-xs leading-5 text-ink-500">Minst 10 tecken med både bokstav och siffra.</p>
          </div>
          <button
            type="submit"
            disabled={loading}
            className={authButtonClass}
          >
            {loading ? "Skapar arbetsyta..." : "Skapa konto"}
          </button>
        </form>
        <p className="mt-5 text-center text-xs leading-5 text-ink-500">
          Genom att skapa kontot godkänner du Revaltas{" "}
          <Link href="/juridik/villkor" className="font-medium text-petroleum-700 hover:underline">användarvillkor</Link>
          {" "}och{" "}
          <Link href="/juridik/integritet" className="font-medium text-petroleum-700 hover:underline">integritetspolicy</Link>.
        </p>
    </AuthShell>
  );
}
