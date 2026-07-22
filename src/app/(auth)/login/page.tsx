"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { safeInternalPath } from "@/lib/security";

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
        const data = await res.json();
        setError(data.error || "Inloggningen misslyckades");
      }
    } catch {
      setError("Något gick fel");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-sand-50 p-4 text-ink-950">
      <section aria-labelledby="login-title" className="w-full max-w-md rounded-3xl border border-sand-200 bg-white p-7 shadow-premium-sm sm:p-9">
        <div className="mb-8 text-center">
          <Link href="/" className="font-display text-xl font-semibold tracking-[-0.04em] text-petroleum-800">Revalta</Link>
          <h1 id="login-title" className="mt-6 font-display text-3xl font-semibold tracking-[-0.03em] text-ink-950">Logga in</h1>
          <p className="mt-2 text-sm text-ink-500">Välkommen tillbaka till din fastighetsförvaltning.</p>
        </div>
        {error && (
          <div role="alert" aria-live="polite" className="mb-6 rounded-xl border border-danger-200 bg-danger-50 p-3 text-center text-sm text-danger-700">
            {error}
          </div>
        )}
        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label htmlFor="login-email" className="mb-1.5 block text-sm font-semibold text-ink-700">E-post</label>
            <input 
              id="login-email"
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
            <label htmlFor="login-password" className="mb-1.5 block text-sm font-semibold text-ink-700">Lösenord</label>
            <input 
              id="login-password"
              type="password" 
              required
              autoComplete="current-password"
              className="block h-12 w-full rounded-xl border border-sand-200 bg-white px-4 text-sm shadow-premium-sm transition focus:border-petroleum-500 focus:ring-2 focus:ring-petroleum-100"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <button 
            type="submit" 
            disabled={loading}
            className="h-12 w-full rounded-xl bg-petroleum-700 px-4 font-semibold text-white shadow-premium-sm transition hover:bg-petroleum-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Loggar in…" : "Logga in"}
          </button>
        </form>
        <p className="mt-8 text-center text-sm text-ink-500">
          Har du inget konto? <Link href="/register" className="font-semibold text-petroleum-700 hover:text-petroleum-900 hover:underline">Skapa ett här</Link>
        </p>
        <p className="mt-3 text-center text-sm text-ink-500">
          <Link href="/forgot-password" className="font-semibold text-petroleum-700 hover:text-petroleum-900 hover:underline">Glömt lösenord?</Link>
        </p>
      </section>
    </main>
  );
}
