"use client";

import { readResponseJson } from "@/lib/fetch-json";
import { Activity, AlertTriangle, CheckCircle2, Clock3, Database, RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { InlineAlert, MetricCard, Panel } from "@/components/dashboard/premium-ui";

type Schema = {
  ready?: boolean;
  missing?: string[];
  checkedAt?: string;
};

type Health = {
  status: string;
  database: string;
  latencyMs: number;
  checkedAt: string;
  modernStorageOnly?: boolean;
  schema?: Schema;
  release?: { commitSha?: string; environment?: string };
  env?: Record<string, boolean>;
  readiness?: { criticalReady?: boolean; storageTokenPresent?: boolean; prefersBlobToken?: boolean };
};

const criticalLabels: Array<{ key: string; label: string; hint: string }> = [
  { key: "databaseUrl", label: "DATABASE_URL", hint: "Pooled Postgres-anslutning" },
  { key: "directUrl", label: "DIRECT_URL", hint: "Direktanslutning för migrationer" },
  { key: "jwtSecret", label: "JWT_SECRET", hint: "Sessions- och token-signering" },
  { key: "emailProvider", label: "EMAIL_PROVIDER_API_KEY", hint: "Transaktionsmail" },
  { key: "emailFrom", label: "EMAIL_FROM", hint: "Verifierad avsändare" },
  { key: "blobReadWriteToken", label: "BLOB_READ_WRITE_TOKEN", hint: "Privat Vercel Blob" },
  { key: "cronSecret", label: "CRON_SECRET", hint: "Skyddar schemalagda jobb" },
];

const optionalLabels: Array<{ key: string; label: string; hint: string }> = [
  { key: "stripe", label: "Stripe", hint: "Krävs endast om billing är live" },
  { key: "smsProvider", label: "SMS", hint: "Valfritt" },
  { key: "ai", label: "AI", hint: "Valfritt" },
  { key: "storageProviderKeyLegacy", label: "STORAGE_PROVIDER_KEY", hint: "Äldre reserv – byt till Blob-token" },
];

const cronJobs = [
  "component-service-reminders",
  "preventive-maintenance",
  "service-assignment-escalations",
  "invoice-export-jobs",
  "recurring-work-orders",
  "recurring-incident-escalations",
  "document-expiry-reminders",
];

function FlagCard({ label, hint, ok }: { label: string; hint: string; ok: boolean }) {
  return (
    <div className="rounded-2xl border border-sand-100 bg-sand-50/80 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-ink-950">{label}</p>
          <p className="mt-1 text-sm text-ink-500">{hint}</p>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${ok ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
          {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
          {ok ? "OK" : "Saknas"}
        </span>
      </div>
    </div>
  );
}

export default function OperationsPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadHealth = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/health", { cache: "no-store" });
      const data = await readResponseJson(response);
      if (!response.ok) {
        setError(data.error || "Kunde inte hämta driftstatus");
        setHealth(null);
        return;
      }
      setHealth(data);
    } catch {
      setError("Kunde inte kontakta servern");
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHealth();
  }, [loadHealth]);

  const env = health?.env || {};
  const criticalMissing = criticalLabels.filter((item) => !env[item.key]).map((item) => item.label);
  const schemaReady = Boolean(health?.schema?.ready);
  const modernOnly = Boolean(health?.modernStorageOnly ?? env.modernStorageOnly);

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-in-soft">
      <header className="flex flex-col justify-between gap-4 rounded-2xl border border-sand-200 bg-white p-7 shadow-premium-sm sm:flex-row sm:items-end sm:p-8">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-petroleum-600">Drift</p>
          <h1 className="mt-2 text-[32px] font-semibold tracking-[-0.035em] text-ink-950 sm:text-[36px]">Systemhälsa och produktion</h1>
          <p className="mt-3 max-w-2xl text-ink-600">
            Kontrollera databas, schema, kritiska secrets, modern storage och cron-beredskap från en plats.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadHealth()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-sand-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-800 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Uppdatera
        </button>
      </header>

      {error ? <InlineAlert>{error}</InlineAlert> : null}

      {health ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard icon={Activity} label="Status" value={health.status} />
            <MetricCard icon={Database} label="Databas" value={health.database} />
            <MetricCard icon={Clock3} label="Svarstid" value={`${health.latencyMs} ms`} />
            <MetricCard icon={ShieldCheck} label="Kritisk beredskap" value={health.readiness?.criticalReady ? "Klar" : "Luckor"} />
          </section>

          {(criticalMissing.length > 0 || !schemaReady) ? (
            <InlineAlert>
              {!schemaReady ? "Schema är inte redo. Kör Database Release / migrate deploy. " : null}
              {criticalMissing.length > 0 ? `Saknade kritiska secrets: ${criticalMissing.join(", ")}.` : null}
            </InlineAlert>
          ) : (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-900">
              Kritiska produktionskrav ser kompletta ut. Schema ready, modern storage och grundläggande secrets är på plats.
            </div>
          )}

          <div className="grid gap-6 xl:grid-cols-2">
            <Panel title="Release och lagring" description="Vilken kod och cutover-nivå som körs i den här miljön.">
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-sand-200 px-4 py-3">
                  <span className="text-ink-500">Miljö</span>
                  <strong className="text-ink-950">{health.release?.environment || "okänd"}</strong>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-sand-200 px-4 py-3">
                  <span className="text-ink-500">Commit</span>
                  <strong className="truncate font-mono text-xs text-ink-950">{health.release?.commitSha || "–"}</strong>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-sand-200 px-4 py-3">
                  <span className="text-ink-500">Schema ready</span>
                  <strong className={schemaReady ? "text-emerald-700" : "text-amber-800"}>{schemaReady ? "Ja" : "Nej"}</strong>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-sand-200 px-4 py-3">
                  <span className="text-ink-500">Modern storage only</span>
                  <strong className={modernOnly ? "text-emerald-700" : "text-amber-800"}>{modernOnly ? "Ja" : "Nej (dual-read)"}</strong>
                </div>
                {health.schema?.missing?.length ? (
                  <p className="rounded-xl bg-amber-50 px-4 py-3 text-amber-900">
                    Saknade schemaobjekt: {health.schema.missing.join(", ")}
                  </p>
                ) : null}
                <p className="text-xs text-ink-500">Kontrollerad {new Date(health.checkedAt).toLocaleString("sv-SE")}</p>
              </div>
            </Panel>

            <Panel title="Cron-beredskap" description="Alla sju jobb i vercel.json ska kunna anropas med CRON_SECRET.">
              <div className="mb-4 flex items-center justify-between rounded-xl border border-sand-200 px-4 py-3 text-sm">
                <span className="text-ink-500">CRON_SECRET</span>
                <strong className={env.cronSecret ? "text-emerald-700" : "text-amber-800"}>{env.cronSecret ? "Konfigurerad" : "Saknas"}</strong>
              </div>
              <ul className="space-y-2 text-sm text-ink-700">
                {cronJobs.map((job) => (
                  <li key={job} className="rounded-lg bg-sand-50 px-3 py-2 font-mono text-xs text-ink-800">/api/cron/{job}</li>
                ))}
              </ul>
              <p className="mt-4 text-sm text-ink-500">
                Kör lokalt: <code className="rounded bg-sand-100 px-1.5 py-0.5 text-xs">BASE_URL=https://www.revalta.se CRON_SECRET=… npm run smoke:cron</code>
              </p>
            </Panel>
          </div>

          <Panel title="Kritiska secrets" description="Måste finnas i Vercel Production för trygg drift.">
            <div className="grid gap-3 md:grid-cols-2">
              {criticalLabels.map((item) => (
                <FlagCard key={item.key} label={item.label} hint={item.hint} ok={Boolean(env[item.key])} />
              ))}
            </div>
          </Panel>

          <Panel title="Valfria integrationer" description="Aktiveras när respektive funktion ska användas live.">
            <div className="grid gap-3 md:grid-cols-2">
              {optionalLabels.map((item) => (
                <FlagCard key={item.key} label={item.label} hint={item.hint} ok={Boolean(env[item.key])} />
              ))}
            </div>
          </Panel>

          <Panel title="Extern övervakning" description="GitHub Actions pingar /api/health var 15:e minut via Production Uptime.">
            <div className="space-y-3 text-sm leading-6 text-ink-600">
              <p>
                Publik health-URL: <code className="rounded bg-sand-100 px-1.5 py-0.5 text-xs">https://www.revalta.se/api/health</code>
              </p>
              <p>
                Förväntat svar: <code className="rounded bg-sand-100 px-1.5 py-0.5 text-xs">{`{"status":"ok","database":"ok"}`}</code>
              </p>
              <p>
                Komplettera gärna med UptimeRobot/Better Stack mot samma URL för SMS/e-postalert utanför GitHub.
              </p>
            </div>
          </Panel>
        </>
      ) : (
        <div className="h-64 animate-pulse rounded-2xl bg-sand-100" />
      )}
    </div>
  );
}
