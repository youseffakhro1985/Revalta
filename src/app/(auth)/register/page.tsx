"use client";

import { readResponseJson } from "@/lib/fetch-json";
import { useEffect, useState } from "react";
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
  const [hydrated, setHydrated] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setHydrated(true);
  }, []);

  const controlsDisabled = !hydrated || loading;

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (controlsDisabled) return;

    const formData = new FormData(e.currentTarget);
    const payload = {
      name: String(formData.get("name") ?? ""),
      companyName: String(formData.get("companyName") ?? ""),
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
    };

    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        router.push("/login?registered=1");
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
      title="Skapa ditt Revalta-konto"
      description="Registrera organisationen och skapa ett säkert ägarkonto för fastigheter, ärenden och arbetsorder."
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
      <form onSubmit={handleRegister} aria-busy={loading} className="mt-7 space-y-5">
        <div>
          <label htmlFor="register-name" className="block text-sm font-medium text-ink-700">Namn</label>
          <input
            id="register-name"
            name="name"
            type="text"
            autoComplete="name"
            maxLength={120}
            disabled={controlsDisabled}
            className={authInputClass}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Förnamn Efternamn"
          />
        </div>
        <div>
          <label htmlFor="register-company" className="block text-sm font-medium text-ink-700">Organisation</label>
          <input
            id="register-company"
            name="companyName"
            type="text"
            required
            minLength={2}
            maxLength={160}
            autoComplete="organization"
            disabled={controlsDisabled}
            className={authInputClass}
            value={companyName}
            onChange={(event) => setCompanyName(event.target.value)}
            placeholder="Exempel: Revalta Förvaltning AB"
          />
        </div>
        <div>
          <label htmlFor="register-email" className="block text-sm font-medium text-ink-700">E-post</label>
          <input
            id="register-email"
            name="email"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            disabled={controlsDisabled}
            className={authInputClass}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="namn@exempel.se"
          />
        </div>
        <div>
          <label htmlFor="register-password" className="block text-sm font-medium text-ink-700">Lösenord</label>
          <input
            id="register-password"
            name="password"
            type="password"
            required
            minLength={10}
            maxLength={128}
            autoComplete="new-password"
            disabled={controlsDisabled}
            className={authInputClass}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••••"
          />
          <p className="mt-2 text-xs leading-5 text-ink-500">Minst 10 tecken med både bokstav och siffra.</p>
        </div>
        <button type="submit" disabled={controlsDisabled} className={authButtonClass}>
          {loading ? "Skapar konto..." : "Skapa konto"}
        </button>
      </form>
    </AuthShell>
  );
}
