"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleDollarSign, FileCheck2, Printer, ReceiptText, Send, XCircle } from "lucide-react";

type Property = { id: string; name: string; address: string; city: string };
type HistoryItem = { id: string; status?: string; previous_status?: string; comment?: string | null; actor_name?: string; created_at: string };
type Quote = {
  id: string;
  property_id?: string;
  property_name?: string;
  title?: string;
  supplier?: string;
  status?: string;
  valid_until?: string | null;
  labor?: number;
  material?: number;
  supplier_cost?: number;
  other?: number;
  subtotal?: number;
  vat_rate?: number;
  vat?: number;
  total?: number;
  note?: string;
  decision_comment?: string | null;
  decision_at?: string | null;
  decision_by?: string | null;
  history?: HistoryItem[];
  created_at: string;
};

const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const labels: Record<string, string> = { draft: "Utkast", sent: "Skickad", approved: "Godkänd", rejected: "Avslagen", invoiced: "Fakturerad" };
const statusClass: Record<string, string> = {
  draft: "bg-sand-100 text-ink-600",
  sent: "bg-blue-50 text-blue-800",
  approved: "bg-emerald-50 text-emerald-800",
  rejected: "bg-red-50 text-red-800",
  invoiced: "bg-petroleum-50 text-petroleum-800",
};

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] || character);
}

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({ propertyId: "", title: "", supplier: "", status: "draft", validUntil: "", labor: "", material: "", supplierCost: "", other: "", vatRate: "25", note: "" });

  async function load() {
    setLoading(true);
    const response = await fetch("/api/quotes", { cache: "no-store" });
    const data = await response.json();
    if (response.ok) { setQuotes(data.quotes || []); setProperties(data.properties || []); }
    else setError(data.error || "Kunde inte hämta offerter");
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const summary = useMemo(() => ({
    total: quotes.reduce((sum, quote) => sum + Number(quote.total || 0), 0),
    approved: quotes.filter((quote) => quote.status === "approved" || quote.status === "invoiced").reduce((sum, quote) => sum + Number(quote.total || 0), 0),
    open: quotes.filter((quote) => quote.status === "draft" || quote.status === "sent").length,
  }), [quotes]);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    const response = await fetch("/api/quotes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const data = await response.json();
    if (!response.ok) setError(data.error || "Kunde inte spara offerten");
    else { setForm({ propertyId: "", title: "", supplier: "", status: "draft", validUntil: "", labor: "", material: "", supplierCost: "", other: "", vatRate: "25", note: "" }); await load(); }
    setSaving(false);
  }

  async function updateStatus(quote: Quote, status: string) {
    const comment = window.prompt(status === "approved" ? "Kommentar till godkännandet (valfritt)" : status === "rejected" ? "Ange skäl till avslag" : "Kommentar (valfritt)", quote.decision_comment || "");
    if (comment === null) return;
    setUpdatingId(quote.id); setError("");
    const response = await fetch("/api/quotes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quoteId: quote.id, status, comment }) });
    const data = await response.json();
    if (!response.ok) setError(data.error || "Kunde inte uppdatera offerten");
    else await load();
    setUpdatingId("");
  }

  function printQuote(quote: Quote) {
    const popup = window.open("", "_blank", "width=900,height=900");
    if (!popup) return;
    const rows = [
      ["Arbete", quote.labor], ["Material", quote.material], ["Leverantör", quote.supplier_cost], ["Övrigt", quote.other],
    ].map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(money.format(Number(value || 0)))}</td></tr>`).join("");
    popup.document.write(`<!doctype html><html lang="sv"><head><meta charset="utf-8"><title>${escapeHtml(quote.title)}</title><style>body{font-family:Arial,sans-serif;color:#1c2624;padding:48px;max-width:760px;margin:auto}h1{font-size:30px;margin:0 0 6px}.brand{color:#214e46;font-weight:700;letter-spacing:-.03em}.meta{color:#68736f;margin-bottom:34px}.status{display:inline-block;padding:6px 10px;border:1px solid #d8ddd9;border-radius:999px;font-size:12px}table{width:100%;border-collapse:collapse;margin-top:30px}td{padding:12px 0;border-bottom:1px solid #e4e7e3}td:last-child{text-align:right;font-weight:600}.total{font-size:20px}.note{margin-top:30px;padding:18px;background:#f7f7f3;border-radius:12px;white-space:pre-wrap}@media print{body{padding:0}}</style></head><body><div class="brand">Revalta</div><p class="meta">Professionellt offertunderlag</p><h1>${escapeHtml(quote.title)}</h1><p>${escapeHtml(quote.property_name)}${quote.supplier ? ` · ${escapeHtml(quote.supplier)}` : ""}</p><span class="status">${escapeHtml(labels[quote.status || "draft"])}</span><table>${rows}<tr><td>Summa exkl. moms</td><td>${escapeHtml(money.format(Number(quote.subtotal || 0)))}</td></tr><tr><td>Moms (${escapeHtml(quote.vat_rate || 0)} %)</td><td>${escapeHtml(money.format(Number(quote.vat || 0)))}</td></tr><tr class="total"><td>Total inkl. moms</td><td>${escapeHtml(money.format(Number(quote.total || 0)))}</td></tr></table>${quote.note ? `<div class="note"><strong>Anteckning</strong><br>${escapeHtml(quote.note)}</div>` : ""}${quote.decision_by ? `<div class="note"><strong>Beslut</strong><br>${escapeHtml(labels[quote.status || "draft"])} av ${escapeHtml(quote.decision_by)}${quote.decision_comment ? `<br>${escapeHtml(quote.decision_comment)}` : ""}</div>` : ""}<script>window.onload=()=>window.print()</script></body></html>`);
    popup.document.close();
  }

  const field = "h-11 w-full rounded-lg border border-sand-200 bg-white px-3 text-sm text-ink-800 outline-none transition focus:border-petroleum-500";

  return <div className="space-y-8">
    <header><p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-ink-400">Ekonomisk uppföljning</p><h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.04em] text-ink-900">Offerter och kostnader</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-ink-500">Samla kalkyl, beslut, historik och export i ett tydligt underlag per fastighet.</p></header>

    <section className="grid gap-4 md:grid-cols-3">
      {[[CircleDollarSign, "Samlat offertvärde", money.format(summary.total)],[FileCheck2, "Godkänt och fakturerat", money.format(summary.approved)],[Send, "Öppna offerter", String(summary.open)]].map(([Icon, label, value]) => { const C = Icon as typeof CircleDollarSign; return <div key={String(label)} className="rounded-2xl border border-sand-200 bg-white p-5 shadow-[0_1px_2px_rgba(17,34,31,0.04)]"><C className="h-5 w-5 text-petroleum-700" strokeWidth={1.6}/><p className="mt-5 text-xs font-medium text-ink-500">{String(label)}</p><p className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-ink-900">{String(value)}</p></div>; })}
    </section>

    <section className="grid gap-6 xl:grid-cols-[390px_1fr]">
      <form onSubmit={submit} className="rounded-2xl border border-sand-200 bg-white p-6 shadow-[0_1px_2px_rgba(17,34,31,0.04)]">
        <h2 className="font-display text-xl font-semibold text-ink-900">Ny offert</h2><p className="mt-1 text-sm text-ink-500">Belopp anges exklusive moms.</p>
        <div className="mt-6 space-y-4">
          <select className={field} value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })} required><option value="">Välj fastighet</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select>
          <input className={field} placeholder="Offertnamn" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <input className={field} placeholder="Leverantör" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
          <div className="grid grid-cols-2 gap-3"><select className={field} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input className={field} type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">{[["labor","Arbete"],["material","Material"],["supplierCost","Leverantör"],["other","Övrigt"]].map(([key, placeholder]) => <input key={key} className={field} type="number" min="0" step="1" placeholder={placeholder} value={form[key as keyof typeof form]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />)}</div>
          <input className={field} type="number" min="0" max="100" placeholder="Moms %" value={form.vatRate} onChange={(e) => setForm({ ...form, vatRate: e.target.value })} />
          <textarea className="min-h-24 w-full rounded-lg border border-sand-200 bg-white px-3 py-3 text-sm outline-none focus:border-petroleum-500" placeholder="Anteckning" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <button disabled={saving} className="h-11 w-full rounded-lg bg-petroleum-700 text-sm font-semibold text-white hover:bg-petroleum-800 disabled:opacity-60">{saving ? "Sparar…" : "Spara offert"}</button>
        </div>
      </form>

      <div className="rounded-2xl border border-sand-200 bg-white shadow-[0_1px_2px_rgba(17,34,31,0.04)]">
        <div className="border-b border-sand-200 px-6 py-5"><h2 className="font-display text-xl font-semibold text-ink-900">Offertöversikt</h2><p className="mt-1 text-sm text-ink-500">Granska, besluta och exportera ekonomiska underlag.</p></div>
        <div className="divide-y divide-sand-200">{loading ? <p className="p-6 text-sm text-ink-500">Hämtar offerter…</p> : quotes.length === 0 ? <div className="p-10 text-center"><ReceiptText className="mx-auto h-7 w-7 text-ink-300"/><p className="mt-3 text-sm text-ink-500">Inga offerter registrerade ännu.</p></div> : quotes.map((quote) => <article key={quote.id} className="p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-ink-900">{quote.title}</h3><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${statusClass[quote.status || "draft"]}`}>{labels[quote.status || "draft"]}</span></div><p className="mt-1 text-sm text-ink-500">{quote.property_name}{quote.supplier ? ` · ${quote.supplier}` : ""}</p></div><div className="text-left sm:text-right"><p className="text-xl font-semibold text-ink-900">{money.format(Number(quote.total || 0))}</p><p className="text-xs text-ink-400">{money.format(Number(quote.subtotal || 0))} exkl. moms</p></div></div>
          <div className="mt-5 grid grid-cols-2 gap-3 text-xs text-ink-500 md:grid-cols-4"><span>Arbete <strong className="mt-1 block text-ink-800">{money.format(Number(quote.labor || 0))}</strong></span><span>Material <strong className="mt-1 block text-ink-800">{money.format(Number(quote.material || 0))}</strong></span><span>Leverantör <strong className="mt-1 block text-ink-800">{money.format(Number(quote.supplier_cost || 0))}</strong></span><span>Moms <strong className="mt-1 block text-ink-800">{money.format(Number(quote.vat || 0))}</strong></span></div>
          <div className="mt-5 flex flex-wrap gap-2">
            {quote.status !== "approved" && quote.status !== "invoiced" ? <button disabled={updatingId === quote.id} onClick={() => void updateStatus(quote, "approved")} className="inline-flex h-9 items-center gap-2 rounded-lg bg-petroleum-700 px-3 text-xs font-semibold text-white disabled:opacity-50"><CheckCircle2 className="h-4 w-4"/>Godkänn</button> : null}
            {quote.status !== "rejected" && quote.status !== "invoiced" ? <button disabled={updatingId === quote.id} onClick={() => void updateStatus(quote, "rejected")} className="inline-flex h-9 items-center gap-2 rounded-lg border border-sand-200 px-3 text-xs font-semibold text-ink-700 disabled:opacity-50"><XCircle className="h-4 w-4"/>Avslå</button> : null}
            {quote.status === "approved" ? <button disabled={updatingId === quote.id} onClick={() => void updateStatus(quote, "invoiced")} className="inline-flex h-9 items-center gap-2 rounded-lg border border-sand-200 px-3 text-xs font-semibold text-ink-700 disabled:opacity-50"><FileCheck2 className="h-4 w-4"/>Markera fakturerad</button> : null}
            <button onClick={() => printQuote(quote)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-sand-200 px-3 text-xs font-semibold text-ink-700"><Printer className="h-4 w-4"/>Skriv ut / PDF</button>
          </div>
          {quote.decision_by ? <div className="mt-4 rounded-xl bg-sand-50 px-4 py-3 text-xs text-ink-600"><strong className="text-ink-800">Senaste beslut:</strong> {labels[quote.status || "draft"]} av {quote.decision_by}{quote.decision_comment ? ` · ${quote.decision_comment}` : ""}</div> : null}
          {quote.history && quote.history.length > 0 ? <details className="mt-4"><summary className="cursor-pointer text-xs font-semibold text-petroleum-700">Visa beslutshistorik ({quote.history.length})</summary><div className="mt-3 space-y-2">{quote.history.map((item) => <div key={item.id} className="border-l-2 border-sand-200 pl-3 text-xs text-ink-500"><strong className="text-ink-700">{labels[item.status || "draft"]}</strong> · {item.actor_name} · {new Date(item.created_at).toLocaleString("sv-SE")}{item.comment ? <p className="mt-1">{item.comment}</p> : null}</div>)}</div></details> : null}
        </article>)}</div>
      </div>
    </section>
  </div>;
}
