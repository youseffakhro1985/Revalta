"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleDollarSign, FileCheck2, Printer, Send, XCircle } from "lucide-react";
import { EmptyState, InlineAlert, MetricCard, PageHeader, Panel, premiumFieldClass, premiumPrimaryButtonClass, premiumTextareaClass } from "@/components/dashboard/premium-ui";

type Property = { id: string; name: string; address: string; city: string };
type HistoryItem = { id: string; status?: string; previous_status?: string; comment?: string | null; actor_name?: string; created_at: string };
type Quote = { id: string; property_name?: string; title?: string; supplier?: string; status?: string; valid_until?: string | null; labor?: number; material?: number; supplier_cost?: number; other?: number; subtotal?: number; vat_rate?: number; vat?: number; total?: number; note?: string; decision_comment?: string | null; decision_at?: string | null; decision_by?: string | null; history?: HistoryItem[]; created_at: string; source?: "table" | "legacy" };

const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const labels: Record<string, string> = { draft: "Utkast", sent: "Skickad", approved: "Godkänd", rejected: "Avslagen", invoiced: "Fakturerad", cancelled: "Makulerad" };
const statusClass: Record<string, string> = { draft: "bg-sand-100 text-ink-600", sent: "bg-blue-50 text-blue-800", approved: "bg-emerald-50 text-emerald-800", rejected: "bg-red-50 text-red-800", invoiced: "bg-petroleum-50 text-petroleum-800", cancelled: "bg-sand-100 text-ink-500" };
function escapeHtml(value: unknown) { return String(value ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c] || c); }

const emptyEdit = { title: "", supplier: "", validUntil: "", labor: "", material: "", supplierCost: "", other: "", vatRate: "25", note: "" };

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editForm, setEditForm] = useState(emptyEdit);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState({ propertyId: "", title: "", supplier: "", status: "draft", validUntil: "", labor: "", material: "", supplierCost: "", other: "", vatRate: "25", note: "" });

  async function load() { setLoading(true); const response = await fetch("/api/quotes", { cache: "no-store" }); const data = await response.json(); if (response.ok) { setQuotes(data.quotes || []); setProperties(data.properties || []); } else setError(data.error || "Kunde inte hämta offerter"); setLoading(false); }
  useEffect(() => { void load(); }, []);

  const summary = useMemo(() => ({ total: quotes.reduce((sum, quote) => sum + Number(quote.total || 0), 0), approved: quotes.filter((quote) => quote.status === "approved" || quote.status === "invoiced").reduce((sum, quote) => sum + Number(quote.total || 0), 0), open: quotes.filter((quote) => quote.status === "draft" || quote.status === "sent").length }), [quotes]);

  function canEditFields(quote: Quote) {
    return quote.source !== "legacy" && (quote.status === "draft" || quote.status === "sent");
  }

  function startEdit(quote: Quote) {
    setEditingId(quote.id);
    setEditForm({
      title: quote.title || "",
      supplier: quote.supplier || "",
      validUntil: quote.valid_until || "",
      labor: String(quote.labor ?? ""),
      material: String(quote.material ?? ""),
      supplierCost: String(quote.supplier_cost ?? ""),
      other: String(quote.other ?? ""),
      vatRate: String(quote.vat_rate ?? 25),
      note: quote.note || "",
    });
  }

  async function submit(event: React.FormEvent) { event.preventDefault(); setSaving(true); setError(""); setSuccess(""); const response = await fetch("/api/quotes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); const data = await response.json(); if (!response.ok) setError(data.error || "Kunde inte spara offerten"); else { setForm({ propertyId: "", title: "", supplier: "", status: "draft", validUntil: "", labor: "", material: "", supplierCost: "", other: "", vatRate: "25", note: "" }); setSuccess("Offerten har sparats."); await load(); } setSaving(false); }

  async function updateStatus(quote: Quote, status: string) {
    if (quote.source === "legacy") {
      setError("Offerten finns i äldre lagring. Kör backfill till Quote innan status ändras.");
      return;
    }
    const comment = window.prompt(status === "approved" ? "Kommentar till godkännandet (valfritt)" : status === "rejected" ? "Ange skäl till avslag" : "Kommentar (valfritt)", quote.decision_comment || "");
    if (comment === null) return;
    setUpdatingId(quote.id);
    setError("");
    setSuccess("");
    const response = await fetch("/api/quotes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quoteId: quote.id, status, comment }) });
    const data = await response.json();
    if (!response.ok) setError(data.error || "Kunde inte uppdatera offerten");
    else await load();
    setUpdatingId("");
  }

  async function saveEdit(quote: Quote) {
    if (!canEditFields(quote)) {
      setError("Belopp och uppgifter kan bara ändras när offerten är utkast eller skickad.");
      return;
    }
    setUpdatingId(quote.id);
    setError("");
    setSuccess("");
    const response = await fetch("/api/quotes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteId: quote.id,
        title: editForm.title,
        supplier: editForm.supplier,
        validUntil: editForm.validUntil,
        labor: editForm.labor,
        material: editForm.material,
        supplierCost: editForm.supplierCost,
        other: editForm.other,
        vatRate: editForm.vatRate,
        note: editForm.note,
      }),
    });
    const data = await response.json();
    if (!response.ok) setError(data.error || "Kunde inte uppdatera offerten");
    else {
      setSuccess("Offerten har uppdaterats.");
      setEditingId("");
      await load();
    }
    setUpdatingId("");
  }

  function printQuote(quote: Quote) { const popup = window.open("", "_blank", "width=900,height=900"); if (!popup) return; const rows = [["Arbete", quote.labor], ["Material", quote.material], ["Leverantör", quote.supplier_cost], ["Övrigt", quote.other]].map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(money.format(Number(value || 0)))}</td></tr>`).join(""); popup.document.write(`<!doctype html><html lang="sv"><head><meta charset="utf-8"><title>${escapeHtml(quote.title)}</title><style>body{font-family:Arial,sans-serif;color:#1c2624;padding:48px;max-width:760px;margin:auto}h1{font-size:30px}.brand{color:#214e46;font-weight:700}table{width:100%;border-collapse:collapse;margin-top:30px}td{padding:12px 0;border-bottom:1px solid #e4e7e3}td:last-child{text-align:right;font-weight:600}.note{margin-top:30px;padding:18px;background:#f7f7f3;border-radius:12px}</style></head><body><div class="brand">Revalta</div><h1>${escapeHtml(quote.title)}</h1><p>${escapeHtml(quote.property_name)}${quote.supplier ? ` · ${escapeHtml(quote.supplier)}` : ""}</p><table>${rows}<tr><td>Summa exkl. moms</td><td>${escapeHtml(money.format(Number(quote.subtotal || 0)))}</td></tr><tr><td>Moms (${escapeHtml(quote.vat_rate || 0)} %)</td><td>${escapeHtml(money.format(Number(quote.vat || 0)))}</td></tr><tr><td>Total inkl. moms</td><td>${escapeHtml(money.format(Number(quote.total || 0)))}</td></tr></table>${quote.note ? `<div class="note">${escapeHtml(quote.note)}</div>` : ""}<script>window.onload=()=>window.print()</script></body></html>`); popup.document.close(); }

  return <div className="space-y-8">
    <PageHeader eyebrow="Ekonomisk uppföljning" title="Offerter och kostnader" description="Samla kalkyl, beslut, historik och export i ett tydligt underlag per fastighet." />
    <section className="grid gap-4 md:grid-cols-3"><MetricCard icon={CircleDollarSign} label="Samlat offertvärde" value={money.format(summary.total)} /><MetricCard icon={FileCheck2} label="Godkänt och fakturerat" value={money.format(summary.approved)} /><MetricCard icon={Send} label="Öppna offerter" value={String(summary.open)} /></section>
    {(error || success) ? <InlineAlert tone={error ? "error" : "success"}>{error || success}</InlineAlert> : null}
    <section className="grid gap-6 xl:grid-cols-[390px_1fr]">
      <Panel title="Ny offert" description="Registrera kostnadsdelar och moms. Belopp anges exklusive moms.">
        <form onSubmit={submit} className="space-y-4"><select className={premiumFieldClass} value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })} required><option value="">Välj fastighet</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select><input className={premiumFieldClass} placeholder="Offertnamn" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /><input className={premiumFieldClass} placeholder="Leverantör" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} /><div className="grid gap-3 sm:grid-cols-2"><select className={premiumFieldClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input className={premiumFieldClass} type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} /></div><div className="grid gap-3 sm:grid-cols-2">{[["labor", "Arbete"], ["material", "Material"], ["supplierCost", "Leverantör"], ["other", "Övrigt"]].map(([key, placeholder]) => <input key={key} className={premiumFieldClass} type="number" min="0" step="1" placeholder={placeholder} value={form[key as keyof typeof form]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />)}</div><input className={premiumFieldClass} type="number" min="0" max="100" placeholder="Moms %" value={form.vatRate} onChange={(e) => setForm({ ...form, vatRate: e.target.value })} /><textarea className={premiumTextareaClass} placeholder="Anteckning" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /><button disabled={saving} className={`${premiumPrimaryButtonClass} w-full`}>{saving ? "Sparar…" : "Spara offert"}</button></form>
      </Panel>
      <Panel title="Offertöversikt" description="Granska, besluta och exportera ekonomiska underlag." bodyClassName="p-0">
        {loading ? <p className="p-6 text-sm text-ink-500">Hämtar offerter…</p> : quotes.length === 0 ? <EmptyState title="Inga offerter registrerade" description="Skapa den första offerten för att börja följa kostnader och beslut." /> : <div className="divide-y divide-sand-100">{quotes.map((quote) => <article key={quote.id} className="p-5 transition hover:bg-sand-50/60 sm:p-6"><div className="flex flex-col justify-between gap-4 sm:flex-row"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-ink-900">{quote.title}</h3><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${statusClass[quote.status || "draft"]}`}>{labels[quote.status || "draft"]}</span></div><p className="mt-1 text-sm text-ink-500">{quote.property_name}{quote.supplier ? ` · ${quote.supplier}` : ""}</p>{quote.source === "legacy" ? <p className="mt-2 text-xs font-medium text-amber-800">Äldre rad – kör backfill innan status kan ändras.</p> : null}</div><div className="space-y-2 sm:text-right"><p className="text-xl font-semibold text-ink-900">{money.format(Number(quote.total || 0))}</p><p className="text-xs text-ink-400">{money.format(Number(quote.subtotal || 0))} exkl. moms</p>{canEditFields(quote) ? <button type="button" onClick={() => (editingId === quote.id ? setEditingId("") : startEdit(quote))} className="block text-xs font-semibold text-petroleum-800 transition hover:text-petroleum-950 sm:ml-auto">{editingId === quote.id ? "Stäng" : "Ändra"}</button> : null}</div></div><div className="mt-5 grid grid-cols-2 gap-3 text-xs text-ink-500 md:grid-cols-4"><span>Arbete<strong className="mt-1 block text-ink-800">{money.format(Number(quote.labor || 0))}</strong></span><span>Material<strong className="mt-1 block text-ink-800">{money.format(Number(quote.material || 0))}</strong></span><span>Leverantör<strong className="mt-1 block text-ink-800">{money.format(Number(quote.supplier_cost || 0))}</strong></span><span>Moms<strong className="mt-1 block text-ink-800">{money.format(Number(quote.vat || 0))}</strong></span></div><div className="mt-5 flex flex-wrap gap-2">{quote.source !== "legacy" && quote.status !== "approved" && quote.status !== "invoiced" && quote.status !== "cancelled" && quote.status !== "rejected" ? <button disabled={updatingId === quote.id} onClick={() => void updateStatus(quote, "approved")} className="inline-flex h-9 items-center gap-2 rounded-lg bg-petroleum-700 px-3 text-xs font-semibold text-white disabled:opacity-50"><CheckCircle2 className="h-4 w-4" />Godkänn</button> : null}{quote.source !== "legacy" && quote.status !== "rejected" && quote.status !== "invoiced" && quote.status !== "cancelled" ? <button disabled={updatingId === quote.id} onClick={() => void updateStatus(quote, "rejected")} className="inline-flex h-9 items-center gap-2 rounded-lg border border-sand-200 px-3 text-xs font-semibold text-ink-700"><XCircle className="h-4 w-4" />Avslå</button> : null}{quote.source !== "legacy" && (quote.status === "draft" || quote.status === "sent") ? <button disabled={updatingId === quote.id} onClick={() => void updateStatus(quote, "cancelled")} className="inline-flex h-9 items-center gap-2 rounded-lg border border-sand-200 px-3 text-xs font-semibold text-red-700">Makulera</button> : null}{quote.source !== "legacy" && quote.status === "approved" ? <button onClick={() => void updateStatus(quote, "invoiced")} className="inline-flex h-9 items-center gap-2 rounded-lg border border-sand-200 px-3 text-xs font-semibold text-ink-700"><FileCheck2 className="h-4 w-4" />Fakturerad</button> : null}<button onClick={() => printQuote(quote)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-sand-200 px-3 text-xs font-semibold text-ink-700"><Printer className="h-4 w-4" />Skriv ut / PDF</button></div>{editingId === quote.id && canEditFields(quote) ? <div className="mt-4 space-y-3 border-t border-sand-100 pt-4"><input className={premiumFieldClass} placeholder="Offertnamn" value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} /><input className={premiumFieldClass} placeholder="Leverantör" value={editForm.supplier} onChange={(e) => setEditForm({ ...editForm, supplier: e.target.value })} /><input className={premiumFieldClass} type="date" value={editForm.validUntil} onChange={(e) => setEditForm({ ...editForm, validUntil: e.target.value })} /><div className="grid gap-3 sm:grid-cols-2">{[["labor", "Arbete"], ["material", "Material"], ["supplierCost", "Leverantör"], ["other", "Övrigt"]].map(([key, placeholder]) => <input key={key} className={premiumFieldClass} type="number" min="0" step="1" placeholder={placeholder} value={editForm[key as keyof typeof editForm]} onChange={(e) => setEditForm({ ...editForm, [key]: e.target.value })} />)}</div><input className={premiumFieldClass} type="number" min="0" max="100" placeholder="Moms %" value={editForm.vatRate} onChange={(e) => setEditForm({ ...editForm, vatRate: e.target.value })} /><textarea className={premiumTextareaClass} placeholder="Anteckning" value={editForm.note} onChange={(e) => setEditForm({ ...editForm, note: e.target.value })} /><button type="button" disabled={updatingId === quote.id} onClick={() => void saveEdit(quote)} className={`${premiumPrimaryButtonClass} sm:w-auto`}>{updatingId === quote.id ? "Sparar…" : "Spara ändringar"}</button></div> : null}{quote.decision_by ? <div className="mt-4 rounded-xl bg-sand-50 px-4 py-3 text-xs text-ink-600"><strong>Senaste beslut:</strong> {labels[quote.status || "draft"]} av {quote.decision_by}{quote.decision_comment ? ` · ${quote.decision_comment}` : ""}</div> : null}</article>)}</div>}
      </Panel>
    </section>
  </div>;
}
