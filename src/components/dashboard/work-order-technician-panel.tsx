"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { CirclePause, CirclePlay, CircleStop, Clock3, Coins, RotateCcw, Smartphone } from "lucide-react";
import { InlineAlert, Panel, premiumFieldClass, premiumPrimaryButtonClass } from "@/components/dashboard/premium-ui";

type Timer = {
  id: string;
  status: "running" | "paused";
  description: string | null;
  segment_started_at: string | null;
  accumulated_minutes: number;
  effective_minutes: number;
  hourly_rate: number | string;
};

type Summary = {
  minutes: number;
  labor_cost: number;
  material_cost: number;
  travel_cost: number;
  external_cost: number;
  total_cost: number;
};

const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });

function duration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours} h ${rest} min`;
}

export function WorkOrderTechnicianPanel({ workOrderId }: { workOrderId: string }) {
  const [timer, setTimer] = useState<Timer | null>(null);
  const [summary, setSummary] = useState<Summary>({ minutes: 0, labor_cost: 0, material_cost: 0, travel_cost: 0, external_cost: 0, total_cost: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [tick, setTick] = useState(Date.now());
  const endpoint = `/api/work-orders/${workOrderId}/technician`;

  const load = useCallback(async () => {
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunde inte hämta teknikerläget");
      setTimer(data.timer || null);
      setSummary(data.summary || {});
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte hämta teknikerläget");
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (timer?.status !== "running") return;
    const interval = window.setInterval(() => setTick(Date.now()), 30000);
    return () => window.clearInterval(interval);
  }, [timer?.status]);

  const liveMinutes = useMemo(() => {
    if (!timer) return 0;
    if (timer.status !== "running" || !timer.segment_started_at) return Number(timer.effective_minutes || timer.accumulated_minutes || 0);
    return Number(timer.accumulated_minutes || 0) + Math.max(0, Math.floor((tick - new Date(timer.segment_started_at).getTime()) / 60000));
  }, [timer, tick]);

  async function action(payload: Record<string, unknown>, message: string) {
    setSaving(true); setError(""); setSuccess("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunde inte uppdatera arbetstimern");
      setSuccess(message);
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte uppdatera arbetstimern");
    } finally { setSaving(false); }
  }

  if (loading) return <div className="h-64 animate-pulse rounded-2xl bg-sand-100" />;

  return (
    <Panel title="Teknikerläge" description="Mobil arbetsyta för tidrapportering och löpande kostnadsuppföljning.">
      <div className="space-y-5">
        {(error || success) ? <InlineAlert tone={error ? "error" : "success"}>{error || success}</InlineAlert> : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-sand-200 bg-sand-50 p-4">
            <div className="flex items-center gap-2 text-ink-500"><Clock3 className="h-4 w-4" /><span className="text-xs font-semibold uppercase tracking-wide">Aktuell tid</span></div>
            <p className="mt-3 text-2xl font-semibold text-ink-950">{duration(liveMinutes)}</p>
          </div>
          <div className="rounded-2xl border border-sand-200 bg-sand-50 p-4">
            <div className="flex items-center gap-2 text-ink-500"><Coins className="h-4 w-4" /><span className="text-xs font-semibold uppercase tracking-wide">Arbetskostnad</span></div>
            <p className="mt-3 text-2xl font-semibold text-ink-950">{money.format(Number(summary.labor_cost || 0))}</p>
          </div>
          <div className="rounded-2xl border border-sand-200 bg-sand-50 p-4">
            <div className="flex items-center gap-2 text-ink-500"><Smartphone className="h-4 w-4" /><span className="text-xs font-semibold uppercase tracking-wide">Totalt utfall</span></div>
            <p className="mt-3 text-2xl font-semibold text-ink-950">{money.format(Number(summary.total_cost || 0))}</p>
          </div>
        </div>

        {!timer ? (
          <form onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); void action({ action: "timer.start", description: data.get("description"), hourlyRate: data.get("hourlyRate") }, "Arbetstimern har startats."); }} className="grid gap-3 rounded-2xl border border-petroleum-200 bg-petroleum-50/50 p-4 sm:grid-cols-[1fr_180px_auto]">
            <input name="description" required placeholder="Vad arbetar du med?" className={premiumFieldClass} />
            <input name="hourlyRate" type="number" min="0" step="1" required placeholder="Timpris exkl. moms" className={premiumFieldClass} />
            <button disabled={saving} className={`${premiumPrimaryButtonClass} min-h-12`}><CirclePlay className="h-5 w-5" />{saving ? "Startar…" : "Starta arbete"}</button>
          </form>
        ) : (
          <div className="rounded-2xl border border-petroleum-200 bg-petroleum-50/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-petroleum-700">{timer.status === "running" ? "Arbete pågår" : "Arbetet är pausat"}</p>
                <p className="mt-1 font-semibold text-ink-900">{timer.description || "Arbetstid"}</p>
                <p className="mt-1 text-xs text-ink-500">Timpris {money.format(Number(timer.hourly_rate || 0))}</p>
              </div>
              <div className="text-right"><p className="text-3xl font-semibold tabular-nums text-ink-950">{duration(liveMinutes)}</p></div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {timer.status === "running" ? (
                <button type="button" disabled={saving} onClick={() => void action({ action: "timer.pause" }, "Arbetstimern har pausats.")} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-sand-300 bg-white px-4 text-sm font-semibold text-ink-700 hover:bg-sand-50"><CirclePause className="h-5 w-5" />Pausa</button>
              ) : (
                <button type="button" disabled={saving} onClick={() => void action({ action: "timer.resume" }, "Arbetstimern har återupptagits.")} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-sand-300 bg-white px-4 text-sm font-semibold text-ink-700 hover:bg-sand-50"><RotateCcw className="h-5 w-5" />Återuppta</button>
              )}
              <button type="button" disabled={saving} onClick={() => void action({ action: "timer.stop" }, "Tiden har registrerats och kostnadsutfallet har uppdaterats.")} className={`${premiumPrimaryButtonClass} min-h-12`}><CircleStop className="h-5 w-5" />Stoppa och registrera</button>
              <button type="button" disabled={saving} onClick={() => { const reason = window.prompt("Varför ska timern avbrytas utan tidsregistrering?"); if (reason) void action({ action: "timer.cancel", reason }, "Timern har avbrutits utan registrering."); }} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 hover:bg-red-50 sm:col-span-2 xl:col-span-1">Avbryt timer</button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div className="rounded-xl border border-sand-200 p-3"><p className="text-xs text-ink-400">Material</p><p className="mt-1 font-semibold text-ink-900">{money.format(Number(summary.material_cost || 0))}</p></div>
          <div className="rounded-xl border border-sand-200 p-3"><p className="text-xs text-ink-400">Resor</p><p className="mt-1 font-semibold text-ink-900">{money.format(Number(summary.travel_cost || 0))}</p></div>
          <div className="rounded-xl border border-sand-200 p-3"><p className="text-xs text-ink-400">Externt</p><p className="mt-1 font-semibold text-ink-900">{money.format(Number(summary.external_cost || 0))}</p></div>
          <div className="rounded-xl border border-sand-200 p-3"><p className="text-xs text-ink-400">Rapporterad tid</p><p className="mt-1 font-semibold text-ink-900">{duration(Number(summary.minutes || 0))}</p></div>
        </div>
      </div>
    </Panel>
  );
}
