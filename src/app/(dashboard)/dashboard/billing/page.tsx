"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { readResponseJson } from "@/lib/fetch-json";
import { premiumPrimaryButtonClass, premiumSecondaryButtonClass } from "@/components/dashboard/premium-ui";

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
  canDirectChangePlan: boolean;
  stripeConfigured: boolean;
  stripePlanReadiness: Record<string, boolean>;
  stripePortalReady: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string | null;
};

const subscriptionStatusLabels: Record<string, string> = {
  active: "Aktivt",
  trialing: "Testperiod",
  past_due: "Betalning försenad",
  unpaid: "Obetalt",
  canceled: "Uppsagt",
  incomplete: "Ofullständigt",
  incomplete_expired: "Utgånget",
  paused: "Pausat",
};

function checkoutReturnMessage() {
  if (typeof window === "undefined") return null;
  const checkout = new URLSearchParams(window.location.search).get("checkout");
  if (checkout === "success") {
    return { type: "success" as const, message: "Stripe Checkout är slutförd. Abonnemangsstatus uppdateras när Stripe-webhooken har behandlats." };
  }
  if (checkout === "cancelled") {
    return { type: "error" as const, message: "Stripe Checkout avbröts. Ingen planändring har genomförts." };
  }
  return null;
}

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
    const returnMessage = checkoutReturnMessage();
    if (returnMessage?.type === "success") setSuccess(returnMessage.message);
    if (returnMessage?.type === "error") setError(returnMessage.message);

    async function loadBilling() {
      try {
        const response = await fetch("/api/billing", { cache: "no-store" });
        if (response.status === 401) {
          router.push("/login");
          return;
        }
        const data = await readResponseJson(response);
        if (!isMounted) return;
        if (!response.ok) {
          setError(data.error || "Kunde inte hämta abonnemangsuppgifter");
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
      const data = await readResponseJson(response);

      if (!response.ok) {
        setError(data.error || "Kunde inte ändra plan");
        return;
      }

      setBilling((current) => current ? { ...current, currentPlan: data.company.plan } : current);
      setSuccess("Planen är uppdaterad.");
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
      const data = await readResponseJson(response);
      if (!response.ok) {
        setError(data.error || "Kunde inte starta checkout");
        return;
      }
      if (data.mode === "mock") {
        setSuccess("Checkout simulerades i utvecklingsmiljön.");
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
      const data = await readResponseJson(response);
      if (!response.ok) {
        setError(data.error || "Kunde inte öppna kundportal");
        return;
      }
      if (data.mode === "mock") {
        setSuccess("Kundportalen simulerades i utvecklingsmiljön.");
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
            Se aktiv plan, kapacitetsgränser och betalningsstatus. Planbyten i produktion genomförs säkert via Stripe Checkout.
          </p>
        </div>
      </header>

      {(error || success) && (
        <div role="status" className={`rounded-2xl border p-4 text-sm font-medium ${error ? "border-danger-500 bg-danger-50 text-danger-700" : "border-success-500 bg-success-50 text-success-700"}`}>
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
              <p className={`mt-3 text-lg font-semibold ${billing.stripeConfigured ? "text-success-700" : "text-warning-700"}`}>
                {billing.stripeConfigured ? "Redo för alla planer" : "Konfiguration behöver slutföras"}
              </p>
              {billing.subscriptionStatus && (
                <p className="mt-2 text-xs font-medium text-ink-500">Abonnemang: {subscriptionStatusLabels[billing.subscriptionStatus] || billing.subscriptionStatus}</p>
              )}
              <button
                type="button"
                onClick={openCustomerPortal}
                disabled={openingPortal || !billing.canManage || !billing.stripePortalReady}
                title={!billing.stripePortalReady ? "Kundportalen blir tillgänglig när Stripe-kund och Stripe-konfiguration är klara." : undefined}
                className={`mt-4 ${premiumSecondaryButtonClass}`}
              >
                {openingPortal ? "Öppnar..." : "Öppna kundportal"}
              </button>
              {!billing.stripePortalReady && (
                <p className="mt-2 text-xs text-ink-500">Kundportalen aktiveras när Stripe-kopplingen och kund-ID:t är klara.</p>
              )}
            </div>
          </section>

          <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            {Object.entries(billing.plans).map(([key, plan]) => {
              const checkoutReady = billing.stripePlanReadiness?.[key] ?? billing.stripeConfigured;
              return (
                <article key={key} className={`rounded-2xl border bg-white p-7 shadow-premium-sm ${billing.currentPlan === key ? "border-petroleum-300 ring-4 ring-petroleum-50" : "border-sand-200"}`}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-petroleum-600">{plan.label}</p>
                  <p className="mt-4 text-[30px] font-semibold tracking-[-0.03em] text-ink-950">{plan.price} kr</p>
                  <p className="mt-1 text-sm text-ink-500">per månad</p>
                  <ul className="mt-6 space-y-3 text-sm text-ink-600">
                    <li>{plan.propertyLimit} fastigheter</li>
                    <li>{plan.teamLimit} teammedlemmar</li>
                    <li>Auditlogg och integrationshistorik</li>
                    <li>AI-stöd för analys och prioritering</li>
                  </ul>
                  {billing.currentPlan === key ? (
                    <button type="button" disabled className={`mt-7 w-full ${premiumPrimaryButtonClass}`}>
                      Aktiv plan
                    </button>
                  ) : billing.canDirectChangePlan ? (
                    <button
                      type="button"
                      disabled={!billing.canManage || savingPlan === key}
                      onClick={() => changePlan(key)}
                      className={`mt-7 w-full ${premiumPrimaryButtonClass}`}
                    >
                      {savingPlan === key ? "Uppdaterar..." : "Byt plan"}
                    </button>
                  ) : null}
                  {billing.currentPlan !== key && (
                    <>
                      <button
                        type="button"
                        disabled={!billing.canManage || checkoutPlan === key || !checkoutReady}
                        onClick={() => startCheckout(key)}
                        title={!checkoutReady ? "Stripe Checkout är inte konfigurerad för den här planen ännu." : undefined}
                        className={`mt-3 w-full ${premiumSecondaryButtonClass}`}
                      >
                        {checkoutPlan === key ? "Startar..." : "Byt plan via Stripe"}
                      </button>
                      {!checkoutReady && (
                        <p className="mt-2 text-xs text-ink-500">Stripe Checkout för den här planen är ännu inte tillgänglig.</p>
                      )}
                    </>
                  )}
                </article>
              );
            })}
          </section>
        </>
      ) : (
        <div className="h-64 animate-pulse rounded-2xl bg-sand-100" />
      )}
    </div>
  );
}
