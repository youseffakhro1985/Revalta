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
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string | null;
};

export default function BillingPage() {
  const [billing, setBilling] = useState<BillingData | null>(null);
  const [savingPlan, setSavingPlan] = useState("");
  const [checkoutPlan, setCheckoutPlan] = useState("");
  const [openingPortal, setOpeningPortal] = useState(false);
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

  async function startCheckout(plan: string) {
    setError("");
    setSuccess("");
    setCheckoutPlan(plan);

    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Kunde inte starta checkout");
        return;
      }
      if (data.mode === "mock") {
        setSuccess("Stripe är inte livekopplat ännu. Checkout-händelsen är loggad i mockläge.");
        return;
      }
      window.location.assign(data.url);
    } catch {
      setError("Kunde inte kontakta servern");
    } finally {
      setCheckoutPlan("");
    }
  }

  async function openCustomerPortal() {
    setError("");
    setSuccess("");
    setOpeningPortal(true);

    try {
      const response = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Kunde inte öppna kundportal");
        return;
      }
      if (data.mode === "mock") {
        setSuccess("Stripe Customer Portal är inte livekopplad ännu. Händelsen är loggad i mockläge.");
        return;
      }
      window.location.assign(data.url);
    } catch {
      setError("Kunde inte kontakta servern");
    } finally {
      setOpeningPortal(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl animate-fade-in space-y-6">
      <header className="overflow-hidden rounded-2xl border border-sand-200 bg-white text-ink-950 shadow-premium-md">
        <div className="p-7 sm:p-8">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-petroleum-700">Abonnemang</p>
          <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.035em] sm:text-[36px]">Planer och kapacitet</h1>
          <p className="mt-3 max-w-2xl text-ink-500">
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
            <div className="rounded-2xl border border-sand-200 bg-white p-6 shadow-premium-sm">
              <p className="text-sm font-medium text-ink-500">Aktiv plan</p>
              <p className="mt-3 text-[22px] font-semibold text-ink-950">{billing.plans[billing.currentPlan]?.label || billing.currentPlan}</p>
            </div>
            <div className="rounded-2xl border border-sand-200 bg-white p-6 shadow-premium-sm">
              <p className="text-sm font-medium text-ink-500">Fastigheter</p>
              <p className="mt-3 text-[22px] font-semibold text-petroleum-600">{billing.usage.properties}</p>
            </div>
            <div className="rounded-2xl border border-sand-200 bg-white p-6 shadow-premium-sm">
              <p className="text-sm font-medium text-ink-500">Team</p>
              <p className="mt-3 text-[22px] font-semibold text-ink-950">{billing.usage.teamMembers}</p>
            </div>
            <div className="rounded-2xl border border-sand-200 bg-white p-6 shadow-premium-sm">
              <p className="text-sm font-medium text-ink-500">Stripe</p>
              <p className={`mt-3 text-lg font-semibold ${billing.stripeConfigured ? "text-success-600" : "text-warning-600"}`}>
                {billing.stripeConfigured ? "Live redo" : "Mockläge"}
              </p>
              {billing.subscriptionStatus && (
                <p className="mt-2 text-xs font-medium text-ink-500">Status: {billing.subscriptionStatus}</p>
              )}
              <button
                type="button"
                onClick={openCustomerPortal}
                disabled={openingPortal || !billing.canManage}
                className="mt-4 rounded-lg border border-sand-200 bg-white px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-sand-50 disabled:opacity-60"
              >
                {openingPortal ? "Öppnar..." : "Kundportal"}
              </button>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            {Object.entries(billing.plans).map(([key, plan]) => (
              <article key={key} className={`rounded-2xl border bg-white p-7 shadow-premium-sm ${billing.currentPlan === key ? "border-petroleum-300 ring-4 ring-petroleum-50" : "border-sand-200"}`}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-petroleum-600">{plan.label}</p>
                <p className="mt-4 text-[30px] font-semibold tracking-[-0.03em] text-ink-950">{plan.price} kr</p>
                <p className="mt-1 text-sm text-ink-500">per månad</p>
                <ul className="mt-6 space-y-3 text-sm text-ink-600">
                  <li>{plan.propertyLimit} fastigheter</li>
                  <li>{plan.teamLimit} teammedlemmar</li>
                  <li>Audit log och integration events</li>
                  <li>AI-analys i dev/mockläge</li>
                </ul>
                <button
                  type="button"
                  disabled={!billing.canManage || savingPlan === key || billing.currentPlan === key}
                  onClick={() => changePlan(key)}
                  className="mt-7 w-full rounded-lg bg-petroleum-700 px-5 py-3 font-semibold text-white transition-colors hover:bg-petroleum-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {billing.currentPlan === key ? "Aktiv plan" : savingPlan === key ? "Uppdaterar..." : "Byt plan"}
                </button>
                {billing.currentPlan !== key && (
                  <button
                    type="button"
                    disabled={!billing.canManage || checkoutPlan === key}
                    onClick={() => startCheckout(key)}
                    className="mt-3 w-full rounded-lg border border-sand-200 bg-white px-5 py-3 font-semibold text-ink-800 transition-colors hover:bg-sand-50 disabled:opacity-60"
                  >
                    {checkoutPlan === key ? "Startar..." : "Starta Stripe Checkout"}
                  </button>
                )}
              </article>
            ))}
          </section>
        </>
      ) : (
        <div className="h-64 animate-pulse rounded-2xl bg-sand-100" />
      )}
    </div>
  );
}
