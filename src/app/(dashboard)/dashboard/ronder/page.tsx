"use client";

import { useEffect, useMemo, useState } from "react";

type Property = { id: string; name: string; address: string; city: string };
type Round = {
  id: string;
  title?: string;
  propertyName?: string;
  interval?: string;
  status?: string;
  nextDue?: string;
  checklist?: Array<{ label: string; completed: boolean }>;
  deviations?: number;
};

const intervalLabels: Record<string, string> = { weekly: "Varje vecka", monthly: "Varje månad", quarterly: "Varje kvartal", yearly: "Varje år" };

export default function RoundsPage() {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [title, setTitle] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [interval, setInterval] = useState("monthly");
  const [checklistText, setChecklistText] = useState("Kontrollera entrébelysning\nKontrollera soprum\nKontrollera dörrstängare");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const [roundsResponse, propertiesResponse] = await Promise.all([
      fetch("/api/rounds", { cache: "no-store" }),
      fetch("/api/properties", { cache: "no-store" }),
    ]);
    const [roundsData, propertiesData] = await Promise.all([roundsResponse.json(), propertiesResponse.json()]);
    if (!roundsResponse.ok) throw new Error(roundsData.error || "Kunde inte hämta ronder");
    setRounds(roundsData.rounds || []);
    setProperties(propertiesData.properties || []);
  }

  useEffect(() => { load().catch((err) => setError(err.message)); }, []);

  const dueSoon = useMemo(() => rounds.filter((round) => round.nextDue && new Date(round.nextDue).getTime() < Date.now() + 14 * 86400000).length, [rounds]);
  const deviations = useMemo(() => rounds.reduce((sum, round) => sum + Number(round.deviations || 0), 0), [rounds]);

  async function createRound(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const checklist = checklistText.split("\n").map((item) => item.trim()).filter(Boolean);
      const response = await fetch("/api/rounds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, propertyId, interval, checklist }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunde inte skapa rond");
      setTitle(""); setMessage("Ronden har skapats."); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Kunde inte skapa rond"); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-6 animate-fade-in-soft">
      <header className="rounded-2xl border border-sand-200 bg-white p-7 shadow-premium-sm sm:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-petroleum-600">Drift och tillsyn</p>
        <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-[32px] font-semibold tracking-[-0.035em] text-ink-950 sm:text-[36px]">Ronder och checklistor</h1>
            <p className="mt-3 max-w-2xl text-ink-600">Planera återkommande tillsyn, följ kontrollpunkter och fånga avvikelser innan de blir kostsamma fel.</p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            {[['Aktiva', rounds.length], ['Snart förfallna', dueSoon], ['Avvikelser', deviations]].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl bg-sand-50 px-4 py-3"><p className="text-2xl font-semibold text-ink-950">{value}</p><p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">{label}</p></div>
            ))}
          </div>
        </div>
      </header>

      {(message || error) && <div className={`rounded-xl border p-4 text-sm font-medium ${error ? 'border-danger-500 bg-danger-50 text-danger-600' : 'border-success-500 bg-success-50 text-success-600'}`}>{error || message}</div>}

      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <form onSubmit={createRound} className="rounded-2xl border border-sand-200 bg-white p-7 shadow-premium-sm">
          <h2 className="text-xl font-semibold text-ink-950">Skapa rond</h2>
          <div className="mt-6 space-y-5">
            <label className="block text-sm font-medium text-ink-700">Namn<input value={title} onChange={(e) => setTitle(e.target.value)} required className="mt-1 w-full rounded-lg border border-sand-200 p-3" placeholder="Ex. Veckorond Brf Solgläntan" /></label>
            <label className="block text-sm font-medium text-ink-700">Fastighet<select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} required className="mt-1 w-full rounded-lg border border-sand-200 bg-white p-3"><option value="">Välj fastighet</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name} – {property.city}</option>)}</select></label>
            <label className="block text-sm font-medium text-ink-700">Intervall<select value={interval} onChange={(e) => setInterval(e.target.value)} className="mt-1 w-full rounded-lg border border-sand-200 bg-white p-3"><option value="weekly">Varje vecka</option><option value="monthly">Varje månad</option><option value="quarterly">Varje kvartal</option><option value="yearly">Varje år</option></select></label>
            <label className="block text-sm font-medium text-ink-700">Kontrollpunkter<textarea value={checklistText} onChange={(e) => setChecklistText(e.target.value)} rows={7} className="mt-1 w-full rounded-lg border border-sand-200 p-3" /><span className="mt-1 block text-xs text-ink-400">En kontrollpunkt per rad.</span></label>
            <button disabled={busy} className="w-full rounded-lg bg-petroleum-700 px-5 py-3 font-semibold text-white disabled:opacity-60">{busy ? "Sparar..." : "Skapa rond"}</button>
          </div>
        </form>

        <section className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-premium-sm">
          <div className="border-b border-sand-200 px-6 py-5"><h2 className="text-xl font-semibold text-ink-950">Planerade ronder</h2><p className="mt-1 text-sm text-ink-500">Samlad kontrollplan för beståndet.</p></div>
          {rounds.length ? <div className="divide-y divide-sand-100">{rounds.map((round) => {
            const complete = round.checklist?.filter((item) => item.completed).length || 0;
            const total = round.checklist?.length || 0;
            return <article key={round.id} className="p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="font-semibold text-ink-950">{round.title}</h3><p className="mt-1 text-sm text-ink-500">{round.propertyName} · {intervalLabels[round.interval || 'monthly']}</p></div><span className="rounded-full border border-sand-200 bg-sand-50 px-3 py-1 text-xs font-semibold text-ink-600">{round.status === 'completed' ? 'Genomförd' : 'Planerad'}</span></div><div className="mt-5 grid grid-cols-3 gap-3 text-sm"><div><p className="text-ink-400">Nästa datum</p><p className="mt-1 font-semibold text-ink-800">{round.nextDue ? new Date(round.nextDue).toLocaleDateString('sv-SE') : 'Ej satt'}</p></div><div><p className="text-ink-400">Kontrollpunkter</p><p className="mt-1 font-semibold text-ink-800">{complete}/{total}</p></div><div><p className="text-ink-400">Avvikelser</p><p className="mt-1 font-semibold text-ink-800">{round.deviations || 0}</p></div></div></article>;
          })}</div> : <div className="p-12 text-center text-ink-500">Inga ronder skapade ännu.</div>}
        </section>
      </div>
    </div>
  );
}
