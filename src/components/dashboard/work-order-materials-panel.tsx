"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { BadgeCheck, Boxes, CircleDollarSign, PackagePlus, RotateCcw, ShieldCheck } from "lucide-react";
import { EmptyState, InlineAlert, Panel, premiumFieldClass, premiumPrimaryButtonClass } from "@/components/dashboard/premium-ui";

type CatalogItem = { id: string; article_number: string; name: string; description: string | null; unit: string; default_unit_cost: number; supplier: string | null; supplier_article_number: string | null; stock_quantity: number; reserved_quantity: number };
type MaterialEntry = { id: string; description: string; quantity: number; unit: string | null; unit_cost: number; total_amount: number; supplier: string | null; occurred_at: string; approval_status: string; approved_at: string | null; approval_comment: string | null; voided_at: string | null; void_reason: string | null; article_number: string | null; item_name: string | null; approved_by: { name: string | null; email: string } | null };
type Props = { workOrderId: string };

const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });
const approvalLabels: Record<string, string> = { pending: "Väntar attest", approved: "Godkänd", rejected: "Avvisad" };

export function WorkOrderMaterialsPanel({ workOrderId }: Props) {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [entries, setEntries] = useState<MaterialEntry[]>([]);
  const [summary, setSummary] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [canApprove, setCanApprove] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false);
  const [error, setError] = useState(""); const [success, setSuccess] = useState("");
  const endpoint = `/api/work-orders/${workOrderId}/materials`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(endpoint, { cache: "no-store" }); const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunde inte hämta material och attest");
      setCatalog(data.catalog || []); setEntries(data.entries || []); setSummary(data.approvalSummary || {}); setCanApprove(Boolean(data.canApprove));
      if (!selectedItemId && data.catalog?.[0]?.id) setSelectedItemId(data.catalog[0].id);
    } catch (err) { setError(err instanceof Error ? err.message : "Kunde inte hämta material och attest"); }
    finally { setLoading(false); }
  }, [endpoint, selectedItemId]);
  useEffect(() => { void load(); }, [load]);

  async function post(payload: Record<string, unknown>, message: string, reset?: () => void) {
    setSaving(true); setError(""); setSuccess("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Kunde inte spara");
      reset?.(); setSuccess(message); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Kunde inte spara"); }
    finally { setSaving(false); }
  }

  const selected = useMemo(() => catalog.find(item => item.id === selectedItemId) ?? null, [catalog, selectedItemId]);
  if (loading) return <div className="h-80 animate-pulse rounded-2xl bg-sand-100" aria-label="Laddar material och attest" />;

  return <div className="space-y-6" aria-busy={saving}>
    {(error || success) ? <InlineAlert tone={error ? "error" : "success"}>{error || success}</InlineAlert> : null}

    <section className="grid gap-4 sm:grid-cols-3">
      <article className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm"><CircleDollarSign className="h-5 w-5 text-amber-600" /><p className="mt-3 text-sm text-ink-500">Väntar attest</p><p className="mt-1 text-2xl font-semibold text-ink-950">{money.format(summary.pending || 0)}</p></article>
      <article className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm"><BadgeCheck className="h-5 w-5 text-petroleum-700" /><p className="mt-3 text-sm text-ink-500">Godkänt</p><p className="mt-1 text-2xl font-semibold text-ink-950">{money.format(summary.approved || 0)}</p></article>
      <article className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm"><ShieldCheck className="h-5 w-5 text-red-600" /><p className="mt-3 text-sm text-ink-500">Avvisat</p><p className="mt-1 text-2xl font-semibold text-ink-950">{money.format(summary.rejected || 0)}</p></article>
    </section>

    <div className="grid gap-6 xl:grid-cols-2">
      <Panel title="Artikelregister" description="Skapa återanvändbara artiklar med pris, enhet och leverantör.">
        <form onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); void post({ action: "item.create", articleNumber: data.get("articleNumber"), name: data.get("name"), unit: data.get("unit"), defaultUnitCost: data.get("defaultUnitCost"), supplier: data.get("supplier"), supplierArticleNumber: data.get("supplierArticleNumber"), description: data.get("description") }, "Artikeln har skapats.", () => form.reset()); }} className="grid gap-3 sm:grid-cols-2">
          <input name="articleNumber" required placeholder="Artikelnummer" className={premiumFieldClass} />
          <input name="name" required placeholder="Artikelnamn" className={premiumFieldClass} />
          <input name="unit" required defaultValue="st" placeholder="Enhet" className={premiumFieldClass} />
          <input name="defaultUnitCost" type="number" min="0" step="0.01" placeholder="Standardpris exkl. moms" className={premiumFieldClass} />
          <input name="supplier" placeholder="Leverantör" className={premiumFieldClass} />
          <input name="supplierArticleNumber" placeholder="Leverantörens artikelnummer" className={premiumFieldClass} />
          <textarea name="description" rows={2} placeholder="Beskrivning" className={`${premiumFieldClass} sm:col-span-2`} />
          <button disabled={saving} className={`${premiumPrimaryButtonClass} sm:col-span-2`}><PackagePlus className="h-4 w-4" />Skapa artikel</button>
        </form>
      </Panel>

      <Panel title="Lager och materialuttag" description="Inleverans och uttag uppdaterar saldo och arbetsorderns kostnad i samma transaktion.">
        {catalog.length === 0 ? <EmptyState title="Inga artiklar" description="Skapa den första artikeln för att börja använda lagerfunktionen." /> : <div className="space-y-4">
          <select value={selectedItemId} onChange={event => setSelectedItemId(event.target.value)} className={premiumFieldClass}>{catalog.map(item => <option key={item.id} value={item.id}>{item.article_number} · {item.name}</option>)}</select>
          {selected ? <div className="grid gap-3 rounded-2xl border border-sand-200 bg-sand-50 p-4 sm:grid-cols-3"><div><p className="text-xs text-ink-500">Tillgängligt</p><p className="mt-1 font-semibold text-ink-950">{selected.stock_quantity} {selected.unit}</p></div><div><p className="text-xs text-ink-500">Standardpris</p><p className="mt-1 font-semibold text-ink-950">{money.format(selected.default_unit_cost)}</p></div><div><p className="text-xs text-ink-500">Leverantör</p><p className="mt-1 font-semibold text-ink-950">{selected.supplier || "Ej angiven"}</p></div></div> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <form onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); void post({ action: "stock.receive", itemId: selectedItemId, quantity: data.get("quantity"), unitCost: data.get("unitCost"), location: data.get("location"), reason: data.get("reason") }, "Inleveransen är registrerad.", () => form.reset()); }} className="space-y-3 rounded-2xl border border-sand-200 p-4">
              <p className="font-semibold text-ink-900">Ta emot till lager</p><input name="quantity" required type="number" min="0.001" step="0.001" placeholder="Antal" className={premiumFieldClass} /><input name="unitCost" type="number" min="0" step="0.01" placeholder="Inköpspris" className={premiumFieldClass} /><input name="location" defaultValue="Huvudlager" placeholder="Lagerplats" className={premiumFieldClass} /><input name="reason" placeholder="Referens eller följesedel" className={premiumFieldClass} /><button disabled={saving || !selectedItemId} className={premiumPrimaryButtonClass}>Registrera inleverans</button>
            </form>
            <form onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); void post({ action: "material.issue", itemId: selectedItemId, quantity: data.get("quantity"), unitCost: data.get("unitCost"), location: data.get("location"), description: data.get("description"), supplier: selected?.supplier }, "Materialet har tagits ut och kostnaden väntar på attest.", () => form.reset()); }} className="space-y-3 rounded-2xl border border-petroleum-200 bg-petroleum-50/30 p-4">
              <p className="font-semibold text-ink-900">Ta ut till arbetsorder</p><input name="quantity" required type="number" min="0.001" step="0.001" placeholder="Antal" className={premiumFieldClass} /><input name="unitCost" type="number" min="0" step="0.01" placeholder={`Pris, standard ${selected?.default_unit_cost ?? 0}`} className={premiumFieldClass} /><input name="location" defaultValue="Huvudlager" placeholder="Lagerplats" className={premiumFieldClass} /><input name="description" defaultValue={selected?.name || ""} placeholder="Beskrivning" className={premiumFieldClass} /><button disabled={saving || !selectedItemId} className={premiumPrimaryButtonClass}><Boxes className="h-4 w-4" />Registrera uttag</button>
            </form>
          </div>
        </div>}
      </Panel>
    </div>

    <Panel title="Materialkostnader och attest" description="Kostnader raderas aldrig spårlöst. Avvisning och annullering bevarar hela revisionskedjan." bodyClassName="p-0">
      {entries.length === 0 ? <div className="p-6"><EmptyState title="Inga materialkostnader" description="Registrerade materialuttag visas här för attest." /></div> : <div className="divide-y divide-sand-100">{entries.map(entry => <article key={entry.id} className={`grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:px-6 ${entry.voided_at ? "bg-sand-50 opacity-70" : ""}`}>
        <div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-ink-950">{entry.article_number ? `${entry.article_number} · ` : ""}{entry.item_name || entry.description}</p><span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${entry.approval_status === "approved" ? "bg-petroleum-100 text-petroleum-800" : entry.approval_status === "rejected" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>{entry.voided_at ? "Annullerad" : approvalLabels[entry.approval_status] || entry.approval_status}</span></div><p className="mt-1 text-sm text-ink-500">{entry.quantity} {entry.unit || "st"} × {money.format(entry.unit_cost)} · {dateTime.format(new Date(entry.occurred_at))}</p>{entry.approval_comment ? <p className="mt-1 text-xs text-ink-500">Attestkommentar: {entry.approval_comment}</p> : null}{entry.void_reason ? <p className="mt-1 text-xs font-medium text-red-700">Annullerad: {entry.void_reason}</p> : null}</div>
        <div className="sm:text-right"><p className="text-lg font-semibold text-ink-950">{money.format(entry.total_amount)}</p>{!entry.voided_at ? <div className="mt-3 flex flex-wrap gap-2 sm:justify-end">{canApprove && entry.approval_status !== "approved" ? <button type="button" disabled={saving} onClick={() => void post({ action: "cost.approve", entryId: entry.id }, "Kostnaden har godkänts.")} className="rounded-xl border border-petroleum-200 bg-petroleum-50 px-3 py-2 text-xs font-semibold text-petroleum-800">Godkänn</button> : null}{canApprove && entry.approval_status !== "rejected" ? <button type="button" disabled={saving} onClick={() => void post({ action: "cost.reject", entryId: entry.id, comment: "Avvisad vid kostnadsattest" }, "Kostnaden har avvisats.")} className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">Avvisa</button> : null}<button type="button" disabled={saving} onClick={() => { const reason = window.prompt("Ange anledning till annullering"); if (reason) void post({ action: "cost.void", entryId: entry.id, reason }, "Kostnadsraden har annullerats och materialet återförts till lagret."); }} className="rounded-xl border border-sand-200 bg-white px-3 py-2 text-xs font-semibold text-ink-600"><RotateCcw className="mr-1 inline h-3.5 w-3.5" />Annullera</button></div> : null}</div>
      </article>)}</div>}
    </Panel>
  </div>;
}
