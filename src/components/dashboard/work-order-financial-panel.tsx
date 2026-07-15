"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { BadgeCheck, Banknote, CircleAlert, Download, FileJson, FileText, LockKeyhole, Printer, ReceiptText, RotateCcw, Send } from "lucide-react";
import { InlineAlert, Panel, premiumFieldClass, premiumPrimaryButtonClass } from "@/components/dashboard/premium-ui";

type FinancialData = {
  workOrder: {
    approved_budget: number | string | null;
    estimated_cost: number | string | null;
    financial_status: string;
    financial_reviewed_at: string | null;
    financial_review_comment: string | null;
    financial_locked_at: string | null;
    billable: boolean;
  };
  summary: { actual_total: number; approved_total: number; pending_total: number; rejected_total: number; pending_count: number };
  variance: { amount: number; percent: number | null };
  invoiceDraft: null | {
    id: string; draft_number: string; status: string; subtotal_ex_vat: number; vat_amount: number; total_inc_vat: number;
    customer_name: string | null; customer_reference: string | null; created_at: string;
    external_system: string | null; external_invoice_id: string | null; exported_at: string | null; sent_at: string | null;
    invoiced_at: string | null; paid_at: string | null; cancelled_at: string | null; status_comment: string | null;
  };
};

const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 1 });
const statusLabels: Record<string, string> = { open: "Öppen", review: "Under granskning", approved: "Slutgodkänd", rejected: "Avvisad", reopened: "Återöppnad" };
const invoiceStatusLabels: Record<string, string> = { draft: "Utkast", exported: "Exporterat", sent: "Skickat", invoiced: "Fakturerat", paid: "Betalt", cancelled: "Annullerat" };
const invoiceTransitions: Record<string, string[]> = { draft: ["exported", "cancelled"], exported: ["sent", "invoiced", "cancelled"], sent: ["invoiced", "cancelled"], invoiced: ["paid", "cancelled"], paid: [], cancelled: [] };

export function WorkOrderFinancialPanel({ workOrderId }: { workOrderId: string }) {
  const endpoint = `/api/work-orders/${workOrderId}/financial`;
  const exportEndpoint = `${endpoint}/export`;
  const [data, setData] = useState<FinancialData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Kunde inte hämta ekonomisk uppföljning");
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte hämta ekonomisk uppföljning");
    } finally { setLoading(false); }
  }, [endpoint]);

  useEffect(() => { void load(); }, [load]);

  async function act(payload: Record<string, unknown>, message: string, reset?: () => void) {
    setSaving(true); setError(""); setSuccess("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Åtgärden kunde inte genomföras");
      reset?.(); setSuccess(message); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Åtgärden kunde inte genomföras"); }
    finally { setSaving(false); }
  }

  async function changeInvoiceStatus(form: HTMLFormElement) {
    const formData = new FormData(form);
    setSaving(true); setError(""); setSuccess("");
    try {
      const response = await fetch(exportEndpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: formData.get("status"), externalSystem: formData.get("externalSystem"), externalInvoiceId: formData.get("externalInvoiceId"), comment: formData.get("comment") }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Fakturastatus kunde inte uppdateras");
      setSuccess("Fakturastatusen har uppdaterats och loggats."); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Fakturastatus kunde inte uppdateras"); }
    finally { setSaving(false); }
  }

  const budget = useMemo(() => Number(data?.workOrder.approved_budget ?? data?.workOrder.estimated_cost ?? 0), [data]);
  const actual = Number(data?.summary.actual_total ?? 0);
  const variance = Number(data?.variance.amount ?? 0);
  const isLocked = Boolean(data?.workOrder.financial_locked_at);
  const varianceTone = variance > 0 ? "border-red-200 bg-red-50 text-red-800" : "border-petroleum-200 bg-petroleum-50 text-petroleum-800";

  if (loading) return <div className="h-80 animate-pulse rounded-2xl bg-sand-100" aria-label="Laddar ekonomisk uppföljning" />;
  if (!data) return <InlineAlert tone="error">{error || "Ekonomisk information saknas"}</InlineAlert>;

  const nextInvoiceStatuses = data.invoiceDraft ? invoiceTransitions[data.invoiceDraft.status] || [] : [];

  return <div className="space-y-6">
    <div aria-live="polite">{(error || success) ? <InlineAlert tone={error ? "error" : "success"}>{error || success}</InlineAlert> : null}</div>

    <Panel title="Budget mot utfall" description="Ekonomisk slutkontroll, attestläge och faktureringsunderlag.">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-sand-200 bg-white p-5"><p className="text-sm text-ink-500">Godkänd budget</p><p className="mt-2 text-2xl font-semibold text-ink-950">{money.format(budget)}</p></article>
        <article className="rounded-2xl border border-sand-200 bg-white p-5"><p className="text-sm text-ink-500">Faktiskt utfall</p><p className="mt-2 text-2xl font-semibold text-ink-950">{money.format(actual)}</p></article>
        <article className={`rounded-2xl border p-5 ${varianceTone}`}><p className="text-sm font-medium">Avvikelse</p><p className="mt-2 text-2xl font-semibold">{variance >= 0 ? "+" : ""}{money.format(variance)}</p><p className="mt-1 text-xs">{data.variance.percent == null ? "Ingen budget satt" : `${data.variance.percent >= 0 ? "+" : ""}${percent.format(data.variance.percent)} %`}</p></article>
        <article className="rounded-2xl border border-sand-200 bg-sand-50 p-5"><p className="text-sm text-ink-500">Ekonomisk status</p><p className="mt-2 text-xl font-semibold text-ink-950">{statusLabels[data.workOrder.financial_status] || data.workOrder.financial_status}</p><p className="mt-1 text-xs text-ink-500">{data.summary.pending_count} kostnadsrader väntar attest</p></article>
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <form onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const formData = new FormData(event.currentTarget); void act({ action: "budget.set", approvedBudget: formData.get("approvedBudget") }, "Budgeten har sparats."); }} className="rounded-2xl border border-sand-200 bg-sand-50/70 p-5">
          <div className="flex items-center gap-3"><Banknote className="h-5 w-5 text-petroleum-700" /><div><h3 className="font-semibold text-ink-950">Godkänd kostnadsbudget</h3><p className="text-sm text-ink-500">Lås referensvärdet innan slutlig ekonomisk granskning.</p></div></div>
          <input name="approvedBudget" type="number" min="0" step="0.01" defaultValue={budget || ""} disabled={isLocked} placeholder="Budget exkl. moms" className={`${premiumFieldClass} mt-4`} />
          <button disabled={saving || isLocked} className={`${premiumPrimaryButtonClass} mt-3 w-full disabled:opacity-50`}>{isLocked ? "Budgeten är låst" : "Spara godkänd budget"}</button>
        </form>

        <div className="rounded-2xl border border-sand-200 bg-white p-5">
          <div className="flex items-center gap-3"><BadgeCheck className="h-5 w-5 text-petroleum-700" /><div><h3 className="font-semibold text-ink-950">Ekonomiskt slutgodkännande</h3><p className="text-sm text-ink-500">Alla kostnadsrader måste vara attesterade.</p></div></div>
          <textarea id={`financial-comment-${workOrderId}`} rows={3} placeholder="Kommentar eller anledning" className={`${premiumFieldClass} mt-4`} />
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {isLocked ? <button type="button" disabled={saving} onClick={() => { const comment = (document.getElementById(`financial-comment-${workOrderId}`) as HTMLTextAreaElement)?.value; void act({ action: "financial.reopen", comment }, "Den ekonomiska granskningen har återöppnats."); }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-sand-300 px-4 text-sm font-semibold text-ink-700"><RotateCcw className="h-4 w-4" />Återöppna</button> : <>
              <button type="button" disabled={saving || data.summary.pending_count > 0} onClick={() => { const comment = (document.getElementById(`financial-comment-${workOrderId}`) as HTMLTextAreaElement)?.value; void act({ action: "financial.approve", comment }, "Ekonomin är slutgodkänd och låst."); }} className={`${premiumPrimaryButtonClass} disabled:opacity-50`}><LockKeyhole className="mr-2 inline h-4 w-4" />Godkänn och lås</button>
              <button type="button" disabled={saving} onClick={() => { const comment = (document.getElementById(`financial-comment-${workOrderId}`) as HTMLTextAreaElement)?.value; void act({ action: "financial.reject", comment }, "Ekonomin har avvisats för korrigering."); }} className="min-h-11 rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700">Avvisa</button>
            </>}
          </div>
          {data.summary.pending_count > 0 ? <p className="mt-3 flex items-center gap-2 text-xs font-medium text-amber-700"><CircleAlert className="h-4 w-4" />Attestera återstående kostnadsrader före slutgodkännande.</p> : null}
        </div>
      </div>
    </Panel>

    <Panel title="Faktureringsunderlag" description="Export, ekonomisystem och spårbar fakturalivscykel.">
      {data.invoiceDraft ? <div className="space-y-5">
        <div className="grid gap-4 rounded-2xl border border-petroleum-200 bg-petroleum-50 p-5 sm:grid-cols-2 xl:grid-cols-5">
          <div><p className="text-xs font-semibold uppercase tracking-wide text-petroleum-600">Underlag</p><p className="mt-1 font-semibold text-petroleum-950">{data.invoiceDraft.draft_number}</p></div>
          <div><p className="text-xs font-semibold uppercase tracking-wide text-petroleum-600">Status</p><p className="mt-1 font-semibold text-petroleum-950">{invoiceStatusLabels[data.invoiceDraft.status] || data.invoiceDraft.status}</p></div>
          <div><p className="text-xs font-semibold uppercase tracking-wide text-petroleum-600">Exkl. moms</p><p className="mt-1 font-semibold text-petroleum-950">{money.format(data.invoiceDraft.subtotal_ex_vat)}</p></div>
          <div><p className="text-xs font-semibold uppercase tracking-wide text-petroleum-600">Moms</p><p className="mt-1 font-semibold text-petroleum-950">{money.format(data.invoiceDraft.vat_amount)}</p></div>
          <div><p className="text-xs font-semibold uppercase tracking-wide text-petroleum-600">Inkl. moms</p><p className="mt-1 font-semibold text-petroleum-950">{money.format(data.invoiceDraft.total_inc_vat)}</p></div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <a href={`${exportEndpoint}?format=csv`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-sand-300 bg-white px-4 text-sm font-semibold text-ink-700 hover:border-petroleum-300"><Download className="h-4 w-4" />Excel / CSV</a>
          <a href={`${exportEndpoint}?format=json`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-sand-300 bg-white px-4 text-sm font-semibold text-ink-700 hover:border-petroleum-300"><FileJson className="h-4 w-4" />Integration / JSON</a>
          <Link href={`/dashboard/arbetsorder/${workOrderId}/fakturaunderlag`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-sand-300 bg-white px-4 text-sm font-semibold text-ink-700 hover:border-petroleum-300"><Printer className="h-4 w-4" />PDF / utskrift</Link>
        </div>

        {nextInvoiceStatuses.length > 0 ? <form onSubmit={(event) => { event.preventDefault(); void changeInvoiceStatus(event.currentTarget); }} className="grid gap-4 rounded-2xl border border-sand-200 bg-sand-50/70 p-5 sm:grid-cols-2">
          <div className="sm:col-span-2 flex items-center gap-3"><ReceiptText className="h-5 w-5 text-petroleum-700" /><div><h3 className="font-semibold text-ink-950">Uppdatera fakturastatus</h3><p className="text-sm text-ink-500">Statusändringen sparas i ett oföränderligt revisionsspår.</p></div></div>
          <select name="status" className={premiumFieldClass}>{nextInvoiceStatuses.map((status) => <option key={status} value={status}>{invoiceStatusLabels[status]}</option>)}</select>
          <input name="externalSystem" defaultValue={data.invoiceDraft.external_system || ""} placeholder="Ekonomisystem, t.ex. Fortnox" className={premiumFieldClass} />
          <input name="externalInvoiceId" defaultValue={data.invoiceDraft.external_invoice_id || ""} placeholder="Externt fakturanummer" className={premiumFieldClass} />
          <input name="comment" placeholder="Kommentar eller annulleringsorsak" className={premiumFieldClass} />
          <button disabled={saving} className={`${premiumPrimaryButtonClass} sm:col-span-2`}><Send className="mr-2 inline h-4 w-4" />Spara fakturastatus</button>
        </form> : <div className="rounded-2xl border border-sand-200 bg-sand-50 p-4 text-sm text-ink-600">Fakturaflödet är avslutat med status <strong>{invoiceStatusLabels[data.invoiceDraft.status] || data.invoiceDraft.status}</strong>.</div>}
      </div> : <form onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; const formData = new FormData(form); void act({ action: "invoice.generate", customerName: formData.get("customerName"), customerReference: formData.get("customerReference"), vatRate: formData.get("vatRate"), notes: formData.get("notes") }, "Faktureringsunderlaget har skapats.", () => form.reset()); }} className="grid gap-4 sm:grid-cols-2">
        <input name="customerName" placeholder="Kund eller kostnadsbärare" className={premiumFieldClass} />
        <input name="customerReference" placeholder="Kundreferens" className={premiumFieldClass} />
        <input name="vatRate" type="number" min="0" max="100" step="0.01" defaultValue="25" aria-label="Momssats" className={premiumFieldClass} />
        <input name="notes" placeholder="Anteckning på underlaget" className={premiumFieldClass} />
        <button disabled={saving || data.workOrder.financial_status !== "approved"} className={`${premiumPrimaryButtonClass} sm:col-span-2 disabled:opacity-50`}><FileText className="mr-2 inline h-4 w-4" />Skapa faktureringsunderlag</button>
      </form>}
    </Panel>
  </div>;
}
