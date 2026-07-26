"use client";

import { readResponseJson } from "@/lib/fetch-json";
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
    <div className="flex min-h-screen items-center justify-center bg-slate-50 animate-fade-in p-4">
      <div className="w-full max-w-md p-8 bg-white rounded-2xl shadow-card-lg border border-slate-100 animate-slide-up">
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-bold text-slate-900 mb-2">Välkommen tillbaka</h2>
          <p className="text-slate-500 text-sm">Logga in för att hantera dina ärenden</p>
        </div>
        {error && (
          <div className="mb-6 p-3 bg-danger-50 border border-danger-500 text-danger-600 rounded-lg text-sm text-center animate-pulse-soft">
            {error}
          </div>
        )}
        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">E-post</label>
            <input 
              type="email" 
              required
              className="block w-full rounded-xl border-slate-200 border p-3 shadow-inner-sm focus:border-brand-500 focus:ring-brand-500 transition-colors outline-none" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="namn@exempel.se"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Lösenord</label>
            <input 
              type="password" 
              required
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
            {loading ? "Loggar in..." : "Logga in"}
          </button>
        </form>
        <p className="mt-8 text-center text-sm text-slate-500">
          Har du inget konto? <Link href="/register" className="text-brand-600 font-medium hover:text-brand-700 hover:underline transition-colors">Skapa ett här</Link>
        </p>
        <p className="mt-3 text-center text-sm text-slate-500">
          <Link href="/forgot-password" className="font-medium text-brand-600 hover:text-brand-700 hover:underline">Glömt lösenord?</Link>
        </p>
      </div>
    </div>
  );
}
