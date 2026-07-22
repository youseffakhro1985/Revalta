"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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
        const data = await res.json();
        setError(data.error || "Kunde inte skapa konto");
      }
    } catch {
      setError("Något gick fel");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-sand-50 p-4 text-ink-950">
      <section aria-labelledby="register-title" className="w-full max-w-md rounded-3xl border border-sand-200 bg-white p-7 shadow-premium-sm sm:p-9">
        <div className="mb-8 text-center">
          <Link href="/" className="font-display text-xl font-semibold tracking-[-0.04em] text-petroleum-800">Revalta</Link>
          <h1 id="register-title" className="mt-6 font-display text-3xl font-semibold tracking-[-0.03em] text-ink-950">Skapa konto</h1>
          <p className="mt-2 text-sm text-ink-500">Kom igång med samlad svensk fastighetsförvaltning.</p>
        </div>
        {error && (
          <div role="alert" aria-live="polite" className="mb-6 rounded-xl border border-danger-200 bg-danger-50 p-3 text-center text-sm text-danger-700">
            {error}
          </div>
        )}
        <form onSubmit={handleRegister} className="space-y-5">
          <div>
            <label htmlFor="register-name" className="mb-1.5 block text-sm font-semibold text-ink-700">Namn</label>
            <input 
              id="register-name"
              type="text" 
              required
              autoComplete="name"
              className="block h-12 w-full rounded-xl border border-sand-200 bg-white px-4 text-sm shadow-premium-sm transition focus:border-petroleum-500 focus:ring-2 focus:ring-petroleum-100"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Förnamn Efternamn"
            />
          </div>
          <div>
            <label htmlFor="register-company" className="mb-1.5 block text-sm font-semibold text-ink-700">Företag</label>
            <input
              id="register-company"
              type="text"
              required
              minLength={2}
              autoComplete="organization"
              className="block h-12 w-full rounded-xl border border-sand-200 bg-white px-4 text-sm shadow-premium-sm transition focus:border-petroleum-500 focus:ring-2 focus:ring-petroleum-100"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Ex. Revalta Förvaltning AB"
            />
          </div>
          <div>
            <label htmlFor="register-email" className="mb-1.5 block text-sm font-semibold text-ink-700">E-post</label>
            <input 
              id="register-email"
              type="email" 
              required
              autoComplete="email"
              inputMode="email"
              className="block h-12 w-full rounded-xl border border-sand-200 bg-white px-4 text-sm shadow-premium-sm transition focus:border-petroleum-500 focus:ring-2 focus:ring-petroleum-100"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="namn@exempel.se"
            />
          </div>
          <div>
            <label htmlFor="register-password" className="mb-1.5 block text-sm font-semibold text-ink-700">Lösenord</label>
            <input 
              id="register-password"
              type="password" 
              required
              minLength={10}
              maxLength={128}
              autoComplete="new-password"
              aria-describedby="register-password-help"
              className="block h-12 w-full rounded-xl border border-sand-200 bg-white px-4 text-sm shadow-premium-sm transition focus:border-petroleum-500 focus:ring-2 focus:ring-petroleum-100"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
            <p id="register-password-help" className="mt-2 text-xs text-ink-500">Minst 10 tecken med både bokstav och siffra.</p>
          </div>
          <button 
            type="submit" 
            disabled={loading}
            className="h-12 w-full rounded-xl bg-petroleum-700 px-4 font-semibold text-white shadow-premium-sm transition hover:bg-petroleum-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Registrerar…" : "Registrera"}
          </button>
        </form>
        <p className="mt-8 text-center text-sm text-ink-500">
          Har du redan ett konto? <Link href="/login" className="font-semibold text-petroleum-700 hover:text-petroleum-900 hover:underline">Logga in</Link>
        </p>
      </section>
    </main>
  );
}
