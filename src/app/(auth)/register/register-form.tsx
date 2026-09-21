"use client";

import { readResponseJson } from "@/lib/fetch-json";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AuthAlert, AuthShell, authButtonClass, authInputClass } from "@/components/auth/auth-shell";
import { isStrongPassword, isValidEmail, passwordPolicyMessage } from "@/lib/security";

function registerError(reason: string) {
  if (reason === "invalid") return "Kontrollera namn, organisation, e-post och lösenord.";
  if (reason === "exists") return "E-postadressen används redan";
  if (reason === "rate") return "För många registreringar. Vänta en stund och prova igen.";
  if (reason === "error") return "Något gick fel";
  return "";
}

export function RegisterForm({ reason }: { reason: string }) {
  const [error, setError] = useState(() => registerError(reason));
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (loading) return;
    if (window.location.hash !== "#register-form") return;
    document.getElementById("register-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => document.getElementById("register-name")?.focus(), 0);
  }, [loading]);

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (loading) return;

    const formData = new FormData(e.currentTarget);
    const payload = {
      name: String(formData.get("name") ?? "").trim(),
      companyName: String(formData.get("companyName") ?? "").trim(),
      email: String(formData.get("email") ?? "").trim(),
      password: String(formData.get("password") ?? ""),
    };

    setError("");
    if (!payload.name || !payload.companyName || !payload.email || !payload.password) {
      setError("Fyll i namn, organisation, e-post och lösenord.");
      return;
    }
    if (!isValidEmail(payload.email)) {
      setError("Ange en giltig e-postadress.");
      return;
    }
    if (!isStrongPassword(payload.password)) {
      setError(passwordPolicyMessage);
      return;
    }
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
      <form
        id="register-form"
        method="post"
        action="/api/auth/register"
        noValidate
        data-ready={hydrated ? "1" : "0"}
        onSubmit={handleRegister}
        aria-busy={loading}
        className="scroll-mt-36 mt-7 space-y-5"
      >
        <div>
          <label htmlFor="register-name" className="block text-sm font-medium text-ink-700">Namn</label>
          <input
            id="register-name"
            autoFocus
            name="name"
            type="text"
            autoComplete="name"
            maxLength={120}
            disabled={loading}
            className={authInputClass}
            defaultValue=""
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
            className={authInputClass}
            defaultValue=""
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
            className={authInputClass}
            defaultValue=""
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
            className={authInputClass}
            defaultValue=""
          />
          <p className="mt-2 text-xs leading-5 text-ink-500">Minst 10 tecken med både bokstav och siffra.</p>
        </div>
        <button type="submit" disabled={loading} className={authButtonClass}>
          {loading ? "Skapar konto..." : "Skapa konto"}
        </button>
      </form>
    </AuthShell>
  );
}
