"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowRight, Building2, KeyRound, AlertCircle } from "lucide-react";
import { login } from "@/app/actions/auth";

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(login, null);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 selection:bg-primary selection:text-white">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary shadow-lg mb-4">
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Välkommen tillbaka</h1>
          <p className="text-muted mt-2 text-sm">Logga in på Revalta för att hantera dina fastigheter.</p>
        </div>

        <div className="bg-card border border-border rounded-2xl shadow-sm p-8">
          <form action={formAction} className="space-y-5">
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">E-postadress</label>
              <input
                type="email"
                name="email"
                placeholder="namn@foretag.se"
                required
                className="w-full bg-background border border-border text-foreground rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-foreground block">Lösenord</label>
                <Link href="/forgot-password" className="text-xs font-medium text-primary hover:underline">
                  Glömt lösenord?
                </Link>
              </div>
              <input
                type="password"
                name="password"
                placeholder="••••••••"
                required
                className="w-full bg-background border border-border text-foreground rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>

            {state?.error && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {state.error}
              </div>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="w-full bg-primary hover:bg-foreground text-white font-medium rounded-lg py-2.5 text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-70"
            >
              {isPending ? "Loggar in..." : "Logga in"}
              {!isPending && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-muted">
            Har du inget konto?{" "}
            <Link href="/register" className="text-primary font-medium hover:underline">
              Skapa konto
            </Link>
          </div>
        </div>

        <div className="mt-8 text-center text-xs text-muted flex items-center justify-center gap-2">
          <KeyRound className="w-3 h-3" />
          Säker inloggning med branschstandard
        </div>
      </div>
    </div>
  );
}
