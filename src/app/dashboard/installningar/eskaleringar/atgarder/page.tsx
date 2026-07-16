"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";
import { EscalationAdminActions } from "@/components/dashboard/escalation-admin-actions";
import { InlineAlert, MetricCard, Panel } from "@/components/dashboard/premium-ui";

type Data = {
  canManage: boolean;
  configuration: { cronSecret: boolean; emailApiKey: boolean; emailFrom: boolean };
  summary: { active: number; blocked: number; overdue: number; failed: number; sent: number };
};

export default function EscalationActionsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/settings/service-escalations", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Kunde inte hämta eskaleringsstatus");
      setData(body);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte hämta eskaleringsstatus");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const configured = useMemo(() => Boolean(data?.configuration.cronSecret && data.configuration.emailApiKey && data.configuration.emailFrom), [data]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-in-soft">
      <header className="rounded-2xl border border-sand-200/80 bg-white p-7 shadow-premium-sm sm:p-8">
        <Link href="/dashboard/installningar/eskaleringar" className="text-sm font-semibold text-petroleum-700 hover:text-petroleum-900">← Serviceeskaleringar</Link>
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-petroleum-600">Administration och felsökning</p>
        <h1 className="mt-2 text-[32px] font-semibold tracking-[-0.035em] text-ink-950 sm:text-[36px]">Test och återförsök</h1>
        <p className="mt-3 max-w-3xl text-ink-600">Verifiera e-postleveransen eller starta den tenant-säkra eskaleringsmotorn manuellt. Varje åtgärd loggas med användare, status och resultat.</p>
      </header>

      {error ? <InlineAlert>{error}</InlineAlert> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard icon={Activity} label="Aktiva fall" value={data?.summary.active ?? "–"} />
        <MetricCard icon={AlertTriangle} label="Misslyckade utskick" value={data?.summary.failed ?? "–"} />
        <MetricCard icon={CheckCircle2} label="Skickade utskick" value={data?.summary.sent ?? "–"} />
      </div>

      <Panel title="Manuella driftåtgärder" description="Åtgärderna är låsta till ägare och administratörer och kräver komplett produktionskonfiguration.">
        <EscalationAdminActions canManage={Boolean(data?.canManage)} configured={configured} onComplete={load} />
      </Panel>

      <Panel title="Säkerhets- och konfigurationskontroll" description="Hemliga värden visas aldrig. Endast deras aktiva status kontrolleras.">
        <div className="space-y-3">
          {[
            ["CRON_SECRET", data?.configuration.cronSecret, "Skyddar den manuella och schemalagda eskaleringsmotorn"],
            ["EMAIL_PROVIDER_API_KEY", data?.configuration.emailApiKey, "Ansluter Revalta till e-postleverantören"],
            ["EMAIL_FROM", data?.configuration.emailFrom, "Verifierad avsändaradress för test och eskaleringar"],
          ].map(([label, active, description]) => (
            <div key={String(label)} className="flex items-start justify-between gap-4 rounded-xl border border-sand-200 p-4">
              <div><p className="font-semibold text-ink-900">{String(label)}</p><p className="mt-1 text-sm text-ink-500">{String(description)}</p></div>
              <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${active ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}><ShieldCheck className="h-3.5 w-3.5" />{active ? "Aktiv" : "Saknas"}</span>
            </div>
          ))}
          {loading ? <p className="text-sm text-ink-500">Kontrollerar konfiguration…</p> : null}
        </div>
      </Panel>
    </div>
  );
}
