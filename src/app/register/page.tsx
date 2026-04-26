"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowRight, Building2, CheckCircle2, AlertCircle } from "lucide-react";
import { register } from "@/app/actions/auth";

export default function RegisterPage() {
  const [state, formAction, isPending] = useActionState(register, null);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 selection:bg-primary selection:text-white">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary shadow-lg mb-4">
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Skapa konto</h1>
          <p className="text-muted mt-2 text-sm">Börja hantera dina fastigheter modernare.</p>
        </div>

        <div className="bg-card border border-border rounded-2xl shadow-sm p-8">
          <form action={formAction} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">Förnamn</label>
                <input
                  type="text"
                  name="firstName"
                  required
                  className="w-full bg-background border border-border text-foreground rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">Efternamn</label>
                <input
                  type="text"
                  name="lastName"
                  required
                  className="w-full bg-background border border-border text-foreground rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">Arbetsmejl</label>
              <input
                type="email"
                name="email"
                placeholder="namn@foretag.se"
                required
                className="w-full bg-background border border-border text-foreground rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">Lösenord</label>
              <input
                type="password"
                name="password"
                placeholder="Minst 8 tecken"
                required
                minLength={8}
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
              className="w-full bg-primary hover:bg-foreground text-white font-medium rounded-lg py-2.5 text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-70 mt-2"
            >
              {isPending ? "Skapar konto..." : "Registrera företag"}
              {!isPending && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-muted">
            Har du redan ett konto?{" "}
            <Link href="/login" className="text-primary font-medium hover:underline">
              Logga in
            </Link>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-center gap-6 text-xs text-muted">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
            <span>Krypterad data</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
            <span>Svensk drift</span>
          </div>
        </div>
      </div>
    </div>
  );
}
