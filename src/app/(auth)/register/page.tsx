"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const [name, setName] = useState("");
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
        body: JSON.stringify({ name, email, password }),
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
    <div className="flex min-h-screen items-center justify-center bg-slate-50 animate-fade-in p-4">
      <div className="w-full max-w-md p-8 bg-white rounded-2xl shadow-card-lg border border-slate-100 animate-slide-up">
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-bold text-slate-900 mb-2">Skapa konto</h2>
          <p className="text-slate-500 text-sm">Bli medlem för att skapa felanmälningar</p>
        </div>
        {error && (
          <div role="alert" aria-live="polite" className="mb-6 p-3 bg-danger-50 border border-danger-500 text-danger-600 rounded-lg text-sm text-center animate-pulse-soft">
            {error}
          </div>
        )}
        <form onSubmit={handleRegister} className="space-y-5">
          <div>
            <label htmlFor="register-name" className="block text-sm font-medium text-slate-700 mb-1">Namn</label>
            <input
              id="register-name"
              type="text"
              autoComplete="name"
              className="block w-full rounded-xl border-slate-200 border p-3 shadow-inner-sm focus:border-brand-500 focus:ring-brand-500 transition-colors outline-none"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Förnamn Efternamn"
            />
          </div>
          <div>
            <label htmlFor="register-email" className="block text-sm font-medium text-slate-700 mb-1">E-post</label>
            <input
              id="register-email"
              type="email"
              required
              autoComplete="email"
              className="block w-full rounded-xl border-slate-200 border p-3 shadow-inner-sm focus:border-brand-500 focus:ring-brand-500 transition-colors outline-none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="namn@exempel.se"
            />
          </div>
          <div>
            <label htmlFor="register-password" className="block text-sm font-medium text-slate-700 mb-1">Lösenord (minst 8 tecken)</label>
            <input
              id="register-password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="block w-full rounded-xl border-slate-200 border p-3 shadow-inner-sm focus:border-brand-500 focus:ring-brand-500 transition-colors outline-none"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-brand-600 text-white font-medium rounded-xl hover:bg-brand-700 transition-all shadow-card hover:shadow-card-md active:scale-[0.98] disabled:opacity-70"
          >
            {loading ? "Registrerar..." : "Registrera"}
          </button>
        </form>
        <p className="mt-8 text-center text-sm text-slate-500">
          Har du redan ett konto? <Link href="/login" className="text-brand-600 font-medium hover:text-brand-700 hover:underline transition-colors">Logga in</Link>
        </p>
      </div>
    </div>
  );
}
