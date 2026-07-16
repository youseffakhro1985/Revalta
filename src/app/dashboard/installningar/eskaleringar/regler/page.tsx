"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Rules = {
  enabled: boolean;
  escalateBlocked: boolean;
  escalateOverdue: boolean;
  graceDays: number;
  repeatDays: number;
  recipientRoles: string[];
  includeAssignee: boolean;
};

type ResponseData = { rules: Rules; updatedAt: string | null; canManage: boolean };

const roleOptions = [
  ["owner", "Ägare"],
  ["admin", "Administratör"],
  ["manager", "Förvaltare"],
  ["property_manager", "Fastighetsförvaltare"],
] as const;

export default function EscalationRulesPage() {
  const [data, setData] = useState<ResponseData | null>(null);
  const [rules, setRules] = useState<Rules | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/settings/service-escalation-rules", { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Kunde inte hämta reglerna");
        setData(body);
        setRules(body.rules);
      } catch (value) {
        setError(value instanceof Error ? value.message : "Kunde inte hämta reglerna");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save() {
    if (!rules) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/settings/service-escalation-rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rules),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Kunde inte spara reglerna");
      setData(body); setRules(body.rules); setMessage("Eskaleringsreglerna har sparats.");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte spara reglerna");
    } finally { setSaving(false); }
  }

  if (loading || !rules) return <div className="mx-auto max-w-5xl rounded-2xl border border-sand-200 bg-white p-8">Laddar eskaleringsregler…</div>;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="rounded-2xl border border-sand-200 bg-white p-8 shadow-premium-sm">
        <Link href="/dashboard/installningar/eskaleringar" className="text-sm font-semibold text-petroleum-700">← Serviceeskaleringar</Link>
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-petroleum-600">Organisationens regler</p>
        <h1 className="mt-2 text-3xl font-semibold text-ink-950">Eskaleringsregler</h1>
        <p className="mt-3 max-w-3xl text-ink-600">Styr när eskaleringar ska skickas, hur ofta de upprepas och vilka roller som ska informeras.</p>
      </header>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div> : null}
      {message ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{message}</div> : null}

      <section className="space-y-6 rounded-2xl border border-sand-200 bg-white p-7 shadow-premium-sm">
        <label className="flex items-center justify-between gap-4 rounded-xl border border-sand-200 p-4"><span><strong className="block text-ink-900">Automatiska eskaleringar</strong><span className="text-sm text-ink-500">Pausa eller aktivera hela motorn.</span></span><input type="checkbox" checked={rules.enabled} disabled={!data?.canManage} onChange={(e) => setRules({ ...rules, enabled: e.target.checked })} /></label>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex items-center gap-3 rounded-xl border border-sand-200 p-4"><input type="checkbox" checked={rules.escalateBlocked} disabled={!data?.canManage} onChange={(e) => setRules({ ...rules, escalateBlocked: e.target.checked })} /><span className="font-semibold text-ink-800">Eskalera blockerade uppgifter</span></label>
          <label className="flex items-center gap-3 rounded-xl border border-sand-200 p-4"><input type="checkbox" checked={rules.escalateOverdue} disabled={!data?.canManage} onChange={(e) => setRules({ ...rules, escalateOverdue: e.target.checked })} /><span className="font-semibold text-ink-800">Eskalera passerade deadlines</span></label>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold text-ink-700">Respittid i dagar<input className="mt-2 w-full rounded-xl border border-sand-200 px-3 py-2" type="number" min={0} max={30} value={rules.graceDays} disabled={!data?.canManage} onChange={(e) => setRules({ ...rules, graceDays: Number(e.target.value) })} /></label>
          <label className="text-sm font-semibold text-ink-700">Upprepa efter antal dagar<input className="mt-2 w-full rounded-xl border border-sand-200 px-3 py-2" type="number" min={1} max={30} value={rules.repeatDays} disabled={!data?.canManage} onChange={(e) => setRules({ ...rules, repeatDays: Number(e.target.value) })} /></label>
        </div>
        <div><p className="mb-3 text-sm font-semibold text-ink-700">Mottagarroller</p><div className="grid gap-3 md:grid-cols-2">{roleOptions.map(([value, label]) => <label key={value} className="flex items-center gap-3 rounded-xl border border-sand-200 p-4"><input type="checkbox" checked={rules.recipientRoles.includes(value)} disabled={!data?.canManage} onChange={(e) => setRules({ ...rules, recipientRoles: e.target.checked ? [...rules.recipientRoles, value] : rules.recipientRoles.filter((role) => role !== value) })} /><span className="font-semibold text-ink-800">{label}</span></label>)}</div></div>
        <label className="flex items-center gap-3 rounded-xl border border-sand-200 p-4"><input type="checkbox" checked={rules.includeAssignee} disabled={!data?.canManage} onChange={(e) => setRules({ ...rules, includeAssignee: e.target.checked })} /><span className="font-semibold text-ink-800">Skicka även till ansvarig användare</span></label>
        <div className="flex items-center justify-between gap-4 border-t border-sand-100 pt-5"><p className="text-sm text-ink-500">Senast ändrad: {data?.updatedAt ? new Date(data.updatedAt).toLocaleString("sv-SE") : "Standardregler används"}</p><button type="button" onClick={() => void save()} disabled={!data?.canManage || saving} className="rounded-xl bg-petroleum-800 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Sparar…" : "Spara regler"}</button></div>
      </section>
    </div>
  );
}
