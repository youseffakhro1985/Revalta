"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleDollarSign, Download, FileCheck2, Plus, Printer, Search, Send, XCircle } from "lucide-react";
import {
  EmptyState,
  InlineAlert,
  MetricCard,
  PageHeader,
  Panel,
  premiumFieldClass,
  premiumPrimaryButtonClass,
  premiumSecondaryButtonClass,
  premiumTextareaClass,
} from "@/components/dashboard/premium-ui";
import { readResponseJson } from "@/lib/fetch-json";

type Property = { id: string; name: string; address: string; city: string };
type HistoryItem = { id: string; status?: string; previous_status?: string; comment?: string | null; actor_name?: string; created_at: string };
type Quote = {
  id: string;
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
  source?: "table" | "legacy";
};

const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" });
const labels: Record<string, string> = { draft: "Utkast", sent: "Skickad", approved: "Godkänd", rejected: "Avslagen", invoiced: "Fakturerad", cancelled: "Makulerad" };
const statusClass: Record<string, string> = {
  draft: "border-sand-200 bg-sand-50 text-ink-600",
  sent: "border-blue-100 bg-blue-50 text-blue-800",
  approved: "border-emerald-100 bg-emerald-50 text-emerald-800",
  rejected: "border-red-100 bg-red-50 text-red-800",
  invoiced: "border-petroleum-100 bg-petroleum-50 text-petroleum-800",
  cancelled: "border-sand-200 bg-sand-100 text-ink-500",
};

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c] || c);
}

function daysUntil(value?: string | null) {
  if (!value) return null;
  const due = new Date(`${value}T12:00:00`).getTime();
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.ceil((due - today.getTime()) / 86400000);
}

const emptyEdit = { title: "", supplier: "", validUntil: "", labor: "", material: "", supplierCost: "", other: "", vatRate: "25", note: "" };

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [decisionId, setDecisionId] = useState("");
  const [decisionStatus, setDecisionStatus] = useState("");
  const [decisionComment, setDecisionComment] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [propertyFilter, setPropertyFilter] = useState("all");
  const [editForm, setEditForm] = useState(emptyEdit);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState({ propertyId: "", title: "", supplier: "", status: "draft", validUntil: "", labor: "", material: "", supplierCost: "", other: "", vatRate: "25", note: "" });

  async function load() {
    setLoading(true);
    setError("");
    const response = await fetch("/api/quotes", { cache: "no-store" });
    const data = await readResponseJson(response);
    if (response.ok) {
      setQuotes(data.quotes || []);
      setProperties(data.properties || []);
      setCanManage(Boolean(data.permissions?.canManage));
    } else {
      setError(data.error || "Kunde inte hämta offerter");
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const propertyNames = useMemo(() => [...new Set(quotes.map((quote) => quote.property_name || "").filter(Boolean))].sort((a, b) => a.localeCompare(b, "sv")), [quotes]);
  const visibleQuotes = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return quotes.filter((quote) => {
      if (statusFilter !== "all" && quote.status !== statusFilter) return false;
      if (propertyFilter !== "all" && quote.property_name !== propertyFilter) return false;
      if (!needle) return true;
      return `${quote.title || ""} ${quote.property_name || ""} ${quote.supplier || ""} ${quote.note || ""}`.toLowerCase().includes(needle);
    });
  }, [quotes, query, statusFilter, propertyFilter]);

  const summary = useMemo(() => ({
    total: visibleQuotes.reduce((sum, quote) => sum + Number(quote.total || 0), 0),
    approved: visibleQuotes.filter((quote) => quote.status === "approved" || quote.status === "invoiced").reduce((sum, quote) => sum + Number(quote.total || 0), 0),
    open: visibleQuotes.filter((quote) => quote.status === "draft" || quote.status === "sent").length,
    expiring: visibleQuotes.filter((quote) => {
      const days = daysUntil(quote.valid_until);
      return (quote.status === "draft" || quote.status === "sent") && days !== null && days <= 14;
    }).length,
  }), [visibleQuotes]);

  const decisionWatch = useMemo(() => [...visibleQuotes]
    .filter((quote) => quote.status === "draft" || quote.status === "sent")
    .sort((a, b) => {
      const aDays = daysUntil(a.valid_until);
      const bDays = daysUntil(b.valid_until);
      return (aDays ?? Number.POSITIVE_INFINITY) - (bDays ?? Number.POSITIVE_INFINITY);
    })
    .slice(0, 5), [visibleQuotes]);

  function canEditFields(quote: Quote) {
    return quote.source !== "legacy" && (quote.status === "draft" || quote.status === "sent");
  }

  function startEdit(quote: Quote) {
    setEditingId(quote.id);
    setDecisionId("");
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

  function startDecision(quote: Quote, status: string) {
    setDecisionId(quote.id);
    setDecisionStatus(status);
    setDecisionComment(quote.decision_comment || "");
    setEditingId("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    const response = await fetch("/api/quotes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const data = await readResponseJson(response);
    if (!response.ok) setError(data.error || "Kunde inte spara offerten");
    else {
      setForm({ propertyId: "", title: "", supplier: "", status: "draft", validUntil: "", labor: "", material: "", supplierCost: "", other: "", vatRate: "25", note: "" });
      setSuccess("Offerten har sparats.");
      setShowCreate(false);
      await load();
    }
    setSaving(false);
  }

  async function updateStatus(quote: Quote, status: string, comment = "") {
    if (quote.source === "legacy") {
      setError("Offerten finns i äldre lagring. Kör backfill till Quote innan status ändras.");
      return;
    }
    setUpdatingId(quote.id);
    setError("");
    setSuccess("");
    const response = await fetch("/api/quotes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quoteId: quote.id, status, comment }) });
    const data = await readResponseJson(response);
    if (!response.ok) setError(data.error || "Kunde inte uppdatera offerten");
    else {
      setDecisionId("");
      setDecisionStatus("");
      setDecisionComment("");
      setSuccess(`Offerten är nu ${labels[status]?.toLowerCase() || status}.`);
      await load();
    }
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
    const data = await readResponseJson(response);
    if (!response.ok) setError(data.error || "Kunde inte uppdatera offerten");
    else {
      setSuccess("Offerten har uppdaterats.");
      setEditingId("");
      await load();
    }
    setUpdatingId("");
  }

  function printQuote(quote: Quote) {
    const popup = window.open("", "_blank", "width=900,height=900");
    if (!popup) return;
    const rows = [["Arbete", quote.labor], ["Material", quote.material], ["Leverantör", quote.supplier_cost], ["Övrigt", quote.other]]
      .map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(money.format(Number(value || 0)))}</td></tr>`).join("");
    popup.document.write(`<!doctype html><html lang="sv"><head><meta charset="utf-8"><title>${escapeHtml(quote.title)}</title><style>body{font-family:Arial,sans-serif;color:#1c2624;padding:48px;max-width:760px;margin:auto}h1{font-size:30px}.brand{color:#214e46;font-weight:700}table{width:100%;border-collapse:collapse;margin-top:30px}td{padding:12px 0;border-bottom:1px solid #e4e7e3}td:last-child{text-align:right;font-weight:600}.note{margin-top:30px;padding:18px;background:#f7f7f3;border-radius:12px}</style></head><body><div class="brand">Revalta</div><h1>${escapeHtml(quote.title)}</h1><p>${escapeHtml(quote.property_name)}${quote.supplier ? ` · ${escapeHtml(quote.supplier)}` : ""}</p><table>${rows}<tr><td>Summa exkl. moms</td><td>${escapeHtml(money.format(Number(quote.subtotal || 0)))}</td></tr><tr><td>Moms (${escapeHtml(quote.vat_rate || 0)} %)</td><td>${escapeHtml(money.format(Number(quote.vat || 0)))}</td></tr><tr><td>Total inkl. moms</td><td>${escapeHtml(money.format(Number(quote.total || 0)))}</td></tr></table>${quote.note ? `<div class="note">${escapeHtml(quote.note)}</div>` : ""}<script>window.onload=()=>window.print()</script></body></html>`);
    popup.document.close();
  }

  function exportCsv() {
    const rows = [
      ["Fastighet", "Offert", "Leverantör", "Status", "Giltigt till", "Exkl moms", "Moms", "Total", "Kommentar"],
      ...visibleQuotes.map((quote) => [quote.property_name || "", quote.title || "", quote.supplier || "", labels[quote.status || "draft"] || quote.status || "", quote.valid_until || "", String(quote.subtotal || 0), String(quote.vat || 0), String(quote.total || 0), quote.note || ""]),
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `revalta-offerter-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const hasFilters = Boolean(query || statusFilter !== "all" || propertyFilter !== "all");

  return <div className="space-y-8">
    <PageHeader
      eyebrow="Ekonomisk uppföljning"
      title="Offerter och kostnadsbeslut"
      description="Samla kalkyl, giltighet, beslut, historik och export i ett tydligt ekonomiskt arbetsflöde per fastighet."
      action={<div className="flex flex-wrap gap-2">{visibleQuotes.length ? <button type="button" onClick={exportCsv} className={premiumSecondaryButtonClass}><Download className="mr-2 h-4 w-4" aria-hidden="true" />CSV</button> : null}{canManage ? <button type="button" onClick={() => setShowCreate((value) => !value)} className={showCreate ? premiumSecondaryButtonClass : premiumPrimaryButtonClass}><Plus className="mr-2 h-4 w-4" aria-hidden="true" />{showCreate ? "Stäng" : "Ny offert"}</button> : null}</div>}
    />

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard icon={CircleDollarSign} label="Samlat offertvärde" value={money.format(summary.total)} hint={`${visibleQuotes.length} offerter i vald vy`} />
      <MetricCard icon={FileCheck2} label="Godkänt / fakturerat" value={money.format(summary.approved)} />
      <MetricCard icon={Send} label="Öppna offerter" value={String(summary.open)} />
      <MetricCard icon={AlertTriangle} label="Går ut / har gått ut" value={String(summary.expiring)} hint="Öppna offerter inom 14 dagar eller passerade" />
    </section>

    {(error || success) ? <InlineAlert tone={error ? "error" : "success"}>{error || success}</InlineAlert> : null}
    {!canManage && !loading ? <InlineAlert tone="info">Du har läsbehörighet. Förvaltare eller administratör kan skapa och ändra offerter.</InlineAlert> : null}

    {showCreate && canManage ? <Panel title="Ny offert" description="Registrera kostnadsdelar, moms, giltighet och initial status. Belopp anges exklusive moms.">
      <form onSubmit={submit} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <select className={premiumFieldClass} value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })} required aria-label="Välj fastighet"><option value="">Välj fastighet</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select>
        <input className={premiumFieldClass} placeholder="Offertnamn" aria-label="Offertnamn" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        <input className={premiumFieldClass} placeholder="Leverantör" aria-label="Leverantör" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
        <select className={premiumFieldClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} aria-label="Status">{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <input className={premiumFieldClass} type="date" aria-label="Giltigt till" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} />
        {[["labor", "Arbete"], ["material", "Material"], ["supplierCost", "Leverantörskostnad"], ["other", "Övrigt"]].map(([key, placeholder]) => <input key={key} className={premiumFieldClass} type="number" min="0" step="1" placeholder={placeholder} aria-label={placeholder} value={form[key as keyof typeof form]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />)}
        <input className={premiumFieldClass} type="number" min="0" max="100" placeholder="Moms %" aria-label="Moms %" value={form.vatRate} onChange={(e) => setForm({ ...form, vatRate: e.target.value })} />
        <textarea className={`${premiumTextareaClass} md:col-span-2 xl:col-span-3`} placeholder="Anteckning" aria-label="Anteckning" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        <button disabled={saving} className={premiumPrimaryButtonClass}>{saving ? "Sparar…" : "Spara offert"}</button>
      </form>
    </Panel> : null}

    <section className="grid gap-6 xl:grid-cols-[1fr_0.72fr]">
      <Panel title="Offertfilter" description="Sök och avgränsa beslutsunderlaget.">
        <div className="grid gap-3 md:grid-cols-[1.4fr_0.9fr_1fr_auto]">
          <label className="relative block"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-ink-400" aria-hidden="true" /><input className={`${premiumFieldClass} pl-9`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Sök offert, leverantör eller fastighet" aria-label="Sök offerter" /></label>
          <select className={premiumFieldClass} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filtrera offertstatus"><option value="all">Alla statusar</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <select className={premiumFieldClass} value={propertyFilter} onChange={(event) => setPropertyFilter(event.target.value)} aria-label="Filtrera fastighet"><option value="all">Alla fastigheter</option>{propertyNames.map((name) => <option key={name} value={name}>{name}</option>)}</select>
          <button type="button" disabled={!hasFilters} onClick={() => { setQuery(""); setStatusFilter("all"); setPropertyFilter("all"); }} className={premiumSecondaryButtonClass}>Rensa</button>
        </div>
      </Panel>

      <Panel title="Beslutsbevakning" description="Öppna offerter närmast sitt giltighetsdatum." bodyClassName="p-0">
        {decisionWatch.length === 0 ? <EmptyState title="Inga öppna offerter i urvalet" /> : <div className="divide-y divide-sand-100">{decisionWatch.map((quote) => {
          const days = daysUntil(quote.valid_until);
          return <div key={quote.id} className="flex items-start justify-between gap-4 px-5 py-4"><div className="min-w-0"><p className="truncate text-sm font-semibold text-ink-800">{quote.title}</p><p className="mt-1 truncate text-xs text-ink-500">{quote.property_name}{quote.supplier ? ` · ${quote.supplier}` : ""}</p></div><div className="shrink-0 text-right"><p className="text-sm font-semibold text-ink-900">{money.format(Number(quote.total || 0))}</p><p className={`mt-1 text-xs ${days !== null && days <= 7 ? "text-red-700" : "text-ink-500"}`}>{days === null ? "Ingen giltighet" : days < 0 ? `${Math.abs(days)} dagar passerad` : days === 0 ? "Går ut idag" : `${days} dagar kvar`}</p></div></div>;
        })}</div>}
      </Panel>
    </section>

    <Panel title="Offertöversikt" description={`${visibleQuotes.length} av ${quotes.length} offerter i vald vy`} bodyClassName="p-0">
      {loading ? <div className="space-y-3 p-6">{[1, 2, 3].map((item) => <div key={item} className="h-32 animate-pulse rounded-xl bg-sand-100" />)}</div> : visibleQuotes.length === 0 ? <EmptyState title="Inga offerter matchar urvalet" description="Justera filtren eller skapa en ny offert." /> : <div className="divide-y divide-sand-100">{visibleQuotes.map((quote) => {
        const days = daysUntil(quote.valid_until);
        const history = (quote.history || []).slice(0, 3);
        return <article key={quote.id} className="p-5 transition hover:bg-sand-50/60 sm:p-6">
          <div className="flex flex-col justify-between gap-4 lg:flex-row">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><h3 className="font-display text-lg font-semibold text-ink-900">{quote.title}</h3><span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${statusClass[quote.status || "draft"]}`}>{labels[quote.status || "draft"]}</span></div>
              <p className="mt-1 text-sm text-ink-500">{quote.property_name}{quote.supplier ? ` · ${quote.supplier}` : ""}</p>
              {quote.note ? <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-500">{quote.note}</p> : null}
              {quote.source === "legacy" ? <p className="mt-2 text-xs font-medium text-amber-800">Äldre rad – kör backfill innan status kan ändras.</p> : null}
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-500"><span>Giltig till <strong className={`font-semibold ${days !== null && days <= 7 && (quote.status === "draft" || quote.status === "sent") ? "text-red-700" : "text-ink-700"}`}>{quote.valid_until ? date.format(new Date(`${quote.valid_until}T12:00:00`)) : "Ej satt"}</strong></span>{quote.decision_by ? <span>Senaste beslut <strong className="font-semibold text-ink-700">{quote.decision_by}</strong></span> : null}</div>
            </div>
            <div className="shrink-0 lg:min-w-[260px] lg:text-right"><p className="text-2xl font-semibold tracking-[-0.03em] text-ink-900">{money.format(Number(quote.total || 0))}</p><p className="mt-1 text-xs text-ink-500">{money.format(Number(quote.subtotal || 0))} exkl. moms · moms {quote.vat_rate || 0} %</p>{canManage && canEditFields(quote) ? <button type="button" onClick={() => (editingId === quote.id ? setEditingId("") : startEdit(quote))} className="mt-3 text-xs font-semibold text-petroleum-800 transition hover:text-petroleum-950">{editingId === quote.id ? "Stäng redigering" : "Ändra offert"}</button> : null}</div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 rounded-2xl border border-sand-100 bg-sand-50/60 p-4 text-xs text-ink-500 md:grid-cols-4"><span>Arbete<strong className="mt-1 block text-ink-800">{money.format(Number(quote.labor || 0))}</strong></span><span>Material<strong className="mt-1 block text-ink-800">{money.format(Number(quote.material || 0))}</strong></span><span>Leverantör<strong className="mt-1 block text-ink-800">{money.format(Number(quote.supplier_cost || 0))}</strong></span><span>Övrigt<strong className="mt-1 block text-ink-800">{money.format(Number(quote.other || 0))}</strong></span></div>

          <div className="mt-5 flex flex-wrap gap-2">
            {canManage && quote.source !== "legacy" && !["approved", "invoiced", "cancelled", "rejected"].includes(quote.status || "draft") ? <button type="button" disabled={updatingId === quote.id} onClick={() => startDecision(quote, "approved")} className="inline-flex h-10 items-center gap-2 rounded-xl bg-petroleum-700 px-3.5 text-xs font-semibold text-white transition hover:bg-petroleum-800 disabled:opacity-50"><CheckCircle2 className="h-4 w-4" />Godkänn</button> : null}
            {canManage && quote.source !== "legacy" && !["rejected", "invoiced", "cancelled"].includes(quote.status || "draft") ? <button type="button" disabled={updatingId === quote.id} onClick={() => startDecision(quote, "rejected")} className="inline-flex h-10 items-center gap-2 rounded-xl border border-sand-200 bg-white px-3.5 text-xs font-semibold text-ink-700 transition hover:bg-sand-50 disabled:opacity-50"><XCircle className="h-4 w-4" />Avslå</button> : null}
            {canManage && quote.source !== "legacy" && (quote.status === "draft" || quote.status === "sent") ? <button type="button" disabled={updatingId === quote.id} onClick={() => startDecision(quote, "cancelled")} className="inline-flex h-10 items-center rounded-xl border border-sand-200 bg-white px-3.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50">Makulera</button> : null}
            {canManage && quote.source !== "legacy" && quote.status === "approved" ? <button type="button" disabled={updatingId === quote.id} onClick={() => void updateStatus(quote, "invoiced", "")} className="inline-flex h-10 items-center gap-2 rounded-xl border border-sand-200 bg-white px-3.5 text-xs font-semibold text-ink-700 transition hover:bg-sand-50 disabled:opacity-50"><FileCheck2 className="h-4 w-4" />Fakturerad</button> : null}
            <button type="button" onClick={() => printQuote(quote)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-sand-200 bg-white px-3.5 text-xs font-semibold text-ink-700 transition hover:bg-sand-50"><Printer className="h-4 w-4" />Skriv ut / PDF</button>
          </div>

          {decisionId === quote.id ? <div className="mt-4 rounded-2xl border border-sand-200 bg-white p-4 shadow-premium-sm"><p className="text-sm font-semibold text-ink-900">{decisionStatus === "approved" ? "Godkänn offert" : decisionStatus === "rejected" ? "Avslå offert" : "Makulera offert"}</p><p className="mt-1 text-xs text-ink-500">Beslutet sparas i offertens historik.</p><textarea className={`${premiumTextareaClass} mt-3`} value={decisionComment} onChange={(event) => setDecisionComment(event.target.value)} placeholder={decisionStatus === "rejected" ? "Ange gärna skäl till avslag" : "Kommentar (valfritt)"} aria-label="Beslutskommentar" /><div className="mt-3 flex gap-2"><button type="button" disabled={updatingId === quote.id} onClick={() => void updateStatus(quote, decisionStatus, decisionComment)} className={premiumPrimaryButtonClass}>{updatingId === quote.id ? "Sparar…" : "Bekräfta beslut"}</button><button type="button" onClick={() => setDecisionId("")} className={premiumSecondaryButtonClass}>Avbryt</button></div></div> : null}

          {canManage && editingId === quote.id && canEditFields(quote) ? <div className="mt-5 space-y-3 rounded-2xl border border-sand-200 bg-sand-50/60 p-4"><div className="grid gap-3 md:grid-cols-2"><input className={premiumFieldClass} placeholder="Offertnamn" aria-label="Offertnamn" value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} /><input className={premiumFieldClass} placeholder="Leverantör" aria-label="Leverantör" value={editForm.supplier} onChange={(e) => setEditForm({ ...editForm, supplier: e.target.value })} /></div><input className={premiumFieldClass} type="date" aria-label="Giltigt till" value={editForm.validUntil} onChange={(e) => setEditForm({ ...editForm, validUntil: e.target.value })} /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["labor", "Arbete"], ["material", "Material"], ["supplierCost", "Leverantör"], ["other", "Övrigt"]].map(([key, placeholder]) => <input key={key} className={premiumFieldClass} type="number" min="0" step="1" placeholder={placeholder} aria-label={placeholder} value={editForm[key as keyof typeof editForm]} onChange={(e) => setEditForm({ ...editForm, [key]: e.target.value })} />)}</div><input className={premiumFieldClass} type="number" min="0" max="100" placeholder="Moms %" aria-label="Moms %" value={editForm.vatRate} onChange={(e) => setEditForm({ ...editForm, vatRate: e.target.value })} /><textarea className={premiumTextareaClass} placeholder="Anteckning" aria-label="Anteckning" value={editForm.note} onChange={(e) => setEditForm({ ...editForm, note: e.target.value })} /><button type="button" disabled={updatingId === quote.id} onClick={() => void saveEdit(quote)} className={`${premiumPrimaryButtonClass} sm:w-auto`}>{updatingId === quote.id ? "Sparar…" : "Spara ändringar"}</button></div> : null}

          {(quote.decision_by || history.length > 0) ? <div className="mt-5 border-t border-sand-100 pt-4"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500">Beslutshistorik</p>{quote.decision_by ? <p className="mt-2 text-xs leading-5 text-ink-600"><strong>{labels[quote.status || "draft"]}</strong> av {quote.decision_by}{quote.decision_at ? ` · ${date.format(new Date(quote.decision_at))}` : ""}{quote.decision_comment ? ` · ${quote.decision_comment}` : ""}</p> : null}{history.length ? <div className="mt-3 space-y-2">{history.map((item) => <p key={item.id} className="text-xs leading-5 text-ink-500">{item.previous_status ? `${labels[item.previous_status] || item.previous_status} → ` : ""}<strong className="text-ink-700">{labels[item.status || ""] || item.status}</strong>{item.actor_name ? ` · ${item.actor_name}` : ""}{item.comment ? ` · ${item.comment}` : ""}</p>)}</div> : null}</div> : null}
        </article>;
      })}</div>}
    </Panel>
  </div>;
}
