"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Plan = {
  label: string;
  price: number;
  propertyLimit: number;
  teamLimit: number;
};

type BillingData = {
  currentPlan: string;
  plans: Record<string, Plan>;
  usage: {
    properties: number;
    teamMembers: number;
    openTickets: number;
  };
  canManage: boolean;
  stripeConfigured: boolean;
};

export default function BillingPage() {
  const [billing, setBilling] = useState<BillingData | null>(null);
  const [savingPlan, setSavingPlan] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;

    async function loadBilling() {
      try {
        const response = await fetch("/api/billing", { cache: "no-store" });
        if (response.status === 401) {
          router.push("/login");
          return;
        }
        const data = await response.json();
        if (!isMounted) return;
        if (!response.ok) {
          setError(data.error || "Kunde inte hämta billing");
          return;
        }
        setBilling(data);
      } catch {
        if (isMounted) setError("Kunde inte kontakta servern");
      }
    }

    loadBilling();

    return () => {
      isMounted = false;
    };
  }, [router]);

  async function changePlan(plan: string) {
    setError("");
    setSuccess("");
    setSavingPlan(plan);

    try {
      const response = await fetch("/api/billing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Kunde inte ändra plan");
        return;
      }

      setBilling((current) => current ? { ...current, currentPlan: data.company.plan } : current);
      setSuccess("Planen är uppdaterad och Stripe-händelsen är loggad.");
    } catch {
      setError("Kunde inte kontakta servern");
    } finally {
      setSavingPlan("");
    }
  }

  return (
    <div className="mx-auto max-w-6xl animate-fade-in space-y-8">
      <header className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-950 text-white shadow-card-lg">
        <div className="bg-[radial-gradient(circle_at_top_right,_rgba(97,114,243,0.35),_transparent_35%)] p-8 sm:p-10">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-brand-200">Billing</p>
          <h1 className="text-4xl font-extrabold tracking-tight">Planer och kapacitet</h1>
          <p className="mt-3 max-w-2xl text-slate-300">
            Hantera abonnemangsplaner i Revalta. I utvecklingsläge loggas planbyten som Stripe-mockar.
          </p>
        </div>
      </header>

      {(error || success) && (
        <div className={`rounded-2xl border p-4 text-sm font-medium ${error ? "border-danger-500 bg-danger-50 text-danger-600" : "border-success-500 bg-success-50 text-success-600"}`}>
          {error || success}
        </div>
      )}

      {billing ? (
        <>
          <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
              <p className="text-sm font-medium text-slate-500">Aktiv plan</p>
              <p className="mt-3 text-2xl font-extrabold text-slate-950">{billing.plans[billing.currentPlan]?.label || billing.currentPlan}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
              <p className="text-sm font-medium text-slate-500">Fastigheter</p>
              <p className="mt-3 text-2xl font-extrabold text-brand-600">{billing.usage.properties}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
              <p className="text-sm font-medium text-slate-500">Team</p>
              <p className="mt-3 text-2xl font-extrabold text-slate-950">{billing.usage.teamMembers}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
              <p className="text-sm font-medium text-slate-500">Stripe</p>
              <p className={`mt-3 text-lg font-bold ${billing.stripeConfigured ? "text-success-600" : "text-warning-600"}`}>
                {billing.stripeConfigured ? "Live redo" : "Mockläge"}
              </p>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            {Object.entries(billing.plans).map(([key, plan]) => (
              <article key={key} className={`rounded-3xl border bg-white p-7 shadow-card ${billing.currentPlan === key ? "border-brand-300 ring-4 ring-brand-50" : "border-slate-200"}`}>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">{plan.label}</p>
                <p className="mt-4 text-4xl font-extrabold text-slate-950">{plan.price} kr</p>
                <p className="mt-1 text-sm text-slate-500">per månad</p>
                <ul className="mt-6 space-y-3 text-sm text-slate-600">
                  <li>{plan.propertyLimit} fastigheter</li>
                  <li>{plan.teamLimit} teammedlemmar</li>
                  <li>Audit log och integration events</li>
                  <li>AI-analys i dev/mockläge</li>
                </ul>
                <button
                  type="button"
                  disabled={!billing.canManage || savingPlan === key || billing.currentPlan === key}
                  onClick={() => changePlan(key)}
                  className="mt-7 w-full rounded-xl bg-slate-950 px-5 py-3 font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {billing.currentPlan === key ? "Aktiv plan" : savingPlan === key ? "Uppdaterar..." : "Byt plan"}
                </button>
              </article>
            ))}
          </section>
        </>
      ) : (
        <div className="h-64 animate-pulse rounded-3xl bg-slate-100" />
      )}
    </div>
  );
}
