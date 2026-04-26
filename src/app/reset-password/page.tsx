"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowRight, ShieldCheck, AlertCircle, CheckCircle2 } from "lucide-react";
import { resetPassword } from "@/app/actions/password";

export default function ResetPasswordPage() {
  const [state, formAction, isPending] = useActionState(resetPassword, null);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 selection:bg-primary selection:text-white">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary shadow-lg mb-4">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Välj nytt lösenord</h1>
          <p className="text-muted mt-2 text-sm">Vänligen fyll i ett nytt, säkert lösenord för ditt konto.</p>
        </div>

        <div className="bg-card border border-border rounded-2xl shadow-sm p-8">
          {state?.success ? (
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 mb-4">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              </div>
              <h3 className="text-sm font-medium text-gray-900 mb-2">Lösenordet är ändrat!</h3>
              <p className="text-sm text-gray-500 mb-6">{state.success}</p>
              <Link
                href="/login"
                className="w-full inline-flex items-center justify-center bg-primary hover:bg-foreground text-white font-medium rounded-lg py-2.5 text-sm transition-all"
              >
                Gå till inloggning
              </Link>
            </div>
          ) : (
            <form action={formAction} className="space-y-5">
              <input type="hidden" name="token" value="dummy-token-from-url" />
              
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">Nytt lösenord</label>
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
                className="w-full bg-primary hover:bg-foreground text-white font-medium rounded-lg py-2.5 text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-70"
              >
                {isPending ? "Sparar..." : "Uppdatera lösenord"}
                {!isPending && <ArrowRight className="w-4 h-4" />}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
