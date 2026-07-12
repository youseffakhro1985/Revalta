"use client";

import { useEffect, useState } from "react";

type Health = {
  status: string;
  database: string;
  latencyMs: number;
  checkedAt: string;
  env: Record<string, boolean>;
};

const labels: Record<string, string> = {
  databaseUrl: "DATABASE_URL",
  directUrl: "DIRECT_URL",
  jwtSecret: "JWT_SECRET",
  emailFrom: "EMAIL_FROM",
  emailProvider: "E-postleverantör",
  smsProvider: "SMS-leverantör",
  stripe: "Stripe",
  storage: "Storage",
  ai: "AI",
};

export default function OperationsPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadHealth() {
      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) {
          setError(data.error || "Kunde inte hämta driftstatus");
          return;
        }
        setHealth(data);
      } catch {
        setError("Kunde inte kontakta servern");
      }
    }

    loadHealth();
  }, []);

  return (
    <div className="mx-auto max-w-6xl animate-fade-in space-y-6">
      <header className="rounded-2xl border border-sand-200 bg-white p-7 shadow-premium-sm sm:p-8">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-petroleum-600">Drift</p>
        <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.035em] sm:text-[36px] text-ink-950">Systemhälsa och produktion</h1>
        <p className="mt-3 max-w-2xl text-ink-600">Överblick över databas, miljövariabler och externa integrationslägen.</p>
      </header>

      {error && <div className="rounded-2xl border border-danger-500 bg-danger-50 p-4 text-danger-600">{error}</div>}

      {health ? (
        <>
          <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-sand-200 bg-white p-6 shadow-premium-sm">
              <p className="text-sm font-medium text-ink-500">Status</p>
              <p className={`mt-3 text-3xl font-semibold ${health.status === "ok" ? "text-success-600" : "text-danger-600"}`}>{health.status}</p>
            </div>
            <div className="rounded-2xl border border-sand-200 bg-white p-6 shadow-premium-sm">
              <p className="text-sm font-medium text-ink-500">Databas</p>
              <p className={`mt-3 text-3xl font-semibold ${health.database === "ok" ? "text-success-600" : "text-danger-600"}`}>{health.database}</p>
            </div>
            <div className="rounded-2xl border border-sand-200 bg-white p-6 shadow-premium-sm">
              <p className="text-sm font-medium text-ink-500">Svarstid</p>
              <p className="mt-3 text-3xl font-semibold text-ink-950">{health.latencyMs} ms</p>
            </div>
          </section>

          <section className="rounded-2xl border border-sand-200 bg-white p-6 shadow-premium-sm">
            <h2 className="text-xl font-semibold text-ink-950">Miljö och integrationer</h2>
            <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
              {Object.entries(health.env).map(([key, value]) => (
                <div key={key} className="rounded-2xl border border-sand-100 bg-sand-50 p-4">
                  <p className="font-semibold text-ink-950">{labels[key] || key}</p>
                  <p className={`mt-2 text-sm font-semibold ${value ? "text-success-600" : "text-warning-600"}`}>{value ? "Konfigurerad" : "Mockläge / saknas"}</p>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : (
        <div className="h-64 animate-pulse rounded-2xl bg-sand-100" />
      )}
    </div>
  );
}
