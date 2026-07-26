"use client";

import { readResponseJson } from "@/lib/fetch-json";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { BadgeCheck, CheckCircle2, ExternalLink, FileCheck2, FileText, ReceiptText, Signature } from "lucide-react";
import { EmptyState, InlineAlert, Panel, premiumFieldClass, premiumPrimaryButtonClass } from "@/components/dashboard/premium-ui";

type SignatureItem = {
  id: string;
  signer_role: "executor" | "contractor" | "customer";
  signer_name: string;
  signer_email: string | null;
  confirmation_text: string;
  signed_at: string;
};

type ReportItem = {
  id: string;
  version: number;
  status: string;
  title: string;
  approved_at: string | null;
  created_at: string;
};

type InvoiceBasis = {
  id: string;
  reference: string;
  status: string;
  subtotal: number;
  vat_rate: number;
  vat_amount: number;
  total: number;
  approved_at: string | null;
  created_at: string;
};

type Props = { workOrderId: string };

const roleLabels: Record<string, string> = {
  executor: "Utförare",
  contractor: "Entreprenör",
  customer: "Beställare",
};

const statusLabels: Record<string, string> = {
  draft: "Utkast",
  approved: "Godkänd",
  exported: "Exporterad",
};

const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });

export function WorkOrderReportingPanel({ workOrderId }: Props) {
  const [signatures, setSignatures] = useState<SignatureItem[]>([]);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [invoiceBases, setInvoiceBases] = useState<InvoiceBasis[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const endpoint = `/api/work-orders/${workOrderId}/reports`;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte hämta rapportflödet");
      setSignatures(data.signatures || []);
      setReports(data.reports || []);
      setInvoiceBases(data.invoiceBases || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte hämta rapportflödet");
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => { void load(); }, [load]);

  async function post(payload: Record<string, unknown>, message: string, reset?: () => void) {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte spara");
      reset?.();
      setSuccess(message);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte spara");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="h-80 animate-pulse rounded-2xl bg-sand-100" />;

  const approvedReports = reports.filter((item) => item.status === "approved").length;
  const approvedInvoices = invoiceBases.filter((item) => item.status === "approved" || item.status === "exported").length;

  return (
    <div className="space-y-6">
      {(error || success) ? <div aria-live="polite"><InlineAlert tone={error ? "error" : "success"}>{error || success}</InlineAlert></div> : null}

      <section className="grid gap-4 sm:grid-cols-3">
        <article className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm">
          <div className="flex items-start justify-between"><div><p className="text-sm text-ink-500">Signaturer</p><p className="mt-2 text-2xl font-semibold text-ink-950">{signatures.length}/3</p><p className="mt-1 text-xs text-ink-400">Utförare, entreprenör och beställare</p></div><Signature className="h-5 w-5 text-petroleum-700" /></div>
        </article>
        <article className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm">
          <div className="flex items-start justify-between"><div><p className="text-sm text-ink-500">Godkända rapporter</p><p className="mt-2 text-2xl font-semibold text-ink-950">{approvedReports}/{reports.length}</p><p className="mt-1 text-xs text-ink-400">Frysta och spårbara underlag</p></div><FileCheck2 className="h-5 w-5 text-petroleum-700" /></div>
        </article>
        <article className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm">
          <div className="flex items-start justify-between"><div><p className="text-sm text-ink-500">Arkiverade underlag</p><p className="mt-2 text-2xl font-semibold text-ink-950">{approvedInvoices}/{invoiceBases.length}</p><p className="mt-1 text-xs text-ink-400">Rapportsnapshots – export sker via Ekonomi</p></div><ReceiptText className="h-5 w-5 text-petroleum-700" /></div>
        </article>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Panel title="Digital signering" description="Registrera ett spårbart intygande från utförare, entreprenör eller beställare.">
          <form onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const form = event.currentTarget;
            const data = new FormData(form);
            void post({
              action: "signature.create",
              signerRole: data.get("signerRole"),
              signerName: data.get("signerName"),
              signerEmail: data.get("signerEmail"),
              confirmationText: data.get("confirmationText"),
            }, "Signaturen har registrerats.", () => form.reset());
          }} className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm text-ink-600"><span>Roll</span><select name="signerRole" className={premiumFieldClass} defaultValue="executor">{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="space-y-1.5 text-sm text-ink-600"><span>Namn</span><input name="signerName" required className={premiumFieldClass} placeholder="För- och efternamn" /></label>
            <label className="space-y-1.5 text-sm text-ink-600"><span>E-post</span><input name="signerEmail" type="email" className={premiumFieldClass} placeholder="namn@foretag.se" /></label>
            <label className="space-y-1.5 text-sm text-ink-600"><span>Intygandetext</span><input name="confirmationText" className={premiumFieldClass} defaultValue="Jag intygar att uppgifterna är korrekta." /></label>
            <label className="sm:col-span-2 inline-flex items-start gap-3 rounded-xl border border-sand-200 bg-sand-50 p-4 text-sm text-ink-600"><input type="checkbox" required className="mt-0.5 h-4 w-4 rounded border-sand-300" /><span>Jag bekräftar att signeringen är avsiktlig och får registreras med datum och tid.</span></label>
            <button disabled={saving} className={`${premiumPrimaryButtonClass} sm:col-span-2`}>{saving ? "Signerar…" : "Registrera signatur"}</button>
          </form>

          <div className="mt-5 space-y-3 border-t border-sand-100 pt-5">
            {signatures.length === 0 ? <EmptyState title="Inga signaturer ännu" description="Registrera den första signaturen när arbetet har granskats." /> : signatures.map((item) => (
              <article key={item.id} className="rounded-2xl border border-sand-200 bg-white p-4">
                <div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-petroleum-700" /><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-ink-900">{item.signer_name}</p><span className="rounded-full bg-petroleum-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-petroleum-800">{roleLabels[item.signer_role]}</span></div><p className="mt-1 text-sm text-ink-500">{item.confirmation_text}</p><p className="mt-2 text-xs text-ink-400">{dateTime.format(new Date(item.signed_at))}{item.signer_email ? ` · ${item.signer_email}` : ""}</p></div></div>
              </article>
            ))}
          </div>
        </Panel>

        <Panel title="Rapport och fakturering" description="Skapa frysta underlag från arbetsorderns aktuella innehåll.">
          <div className="space-y-4">
            <div className="rounded-2xl border border-sand-200 bg-sand-50/70 p-4">
              <div className="flex items-start gap-3"><FileText className="mt-0.5 h-5 w-5 text-petroleum-700" /><div><h3 className="font-semibold text-ink-900">Arbetsrapport</h3><p className="mt-1 text-sm leading-6 text-ink-500">Fryser arbetsorder, checklista, registreringar, dokument, signaturer och kostnadsuppgifter i en ny version.</p></div></div>
              <button type="button" disabled={saving} onClick={() => void post({ action: "report.create" }, "En ny arbetsrapport har skapats.")} className={`${premiumPrimaryButtonClass} mt-4 w-full`}>{saving ? "Skapar…" : "Skapa arbetsrapport"}</button>
            </div>
            <div className="rounded-2xl border border-sand-200 bg-sand-50/70 p-4">
              <div className="flex items-start gap-3"><ReceiptText className="mt-0.5 h-5 w-5 text-petroleum-700" /><div><h3 className="font-semibold text-ink-900">Fakturaunderlag</h3><p className="mt-1 text-sm leading-6 text-ink-500">Bygger exportbart underlag från attesterad tid och material (samma källa som Ekonomi och fakturering) och arkiverar en rapportsnapshot.</p></div></div>
              <button type="button" disabled={saving} onClick={() => void post({ action: "invoice.create" }, "Exportbart fakturaunderlag har skapats från attesterade rader.")} className={`${premiumPrimaryButtonClass} mt-4 w-full`}>{saving ? "Skapar…" : "Skapa fakturaunderlag"}</button>
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Rapportversioner" description="Granska, skriv ut och godkänn frysta arbetsrapporter." bodyClassName="p-0">
          {reports.length === 0 ? <EmptyState title="Ingen arbetsrapport skapad" description="Skapa en rapport när arbetsordern är redo för granskning." /> : <div className="divide-y divide-sand-100">{reports.map((report) => <article key={report.id} className="p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-ink-900">{report.title}</p><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${report.status === "approved" ? "bg-petroleum-50 text-petroleum-800" : "bg-sand-100 text-ink-600"}`}>{statusLabels[report.status] || report.status}</span></div><p className="mt-1 text-xs text-ink-400">Version {report.version} · {dateTime.format(new Date(report.created_at))}</p>{report.approved_at ? <p className="mt-1 text-xs font-medium text-petroleum-700">Godkänd {dateTime.format(new Date(report.approved_at))}</p> : null}</div><div className="flex flex-wrap gap-2"><Link href={`/arbetsrapport/${report.id}`} target="_blank" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-sand-300 bg-white px-3 text-xs font-semibold text-ink-700 hover:border-petroleum-300 hover:text-petroleum-800"><ExternalLink className="h-3.5 w-3.5" />Öppna rapport</Link>{report.status !== "approved" ? <button type="button" disabled={saving} onClick={() => void post({ action: "report.approve", reportId: report.id }, "Arbetsrapporten har godkänts.")} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-petroleum-800 px-3 text-xs font-semibold text-white hover:bg-petroleum-900 disabled:opacity-60"><BadgeCheck className="h-3.5 w-3.5" />Godkänn</button> : null}</div></div></article>)}</div>}
        </Panel>

        <Panel title="Arkiverade fakturaunderlag" description="Rapportsnapshots. Fortnox/Visma-export sker från Ekonomi och fakturering." bodyClassName="p-0">
          {invoiceBases.length === 0 ? <EmptyState title="Inget fakturaunderlag skapat" description="Attestera tid och material under Ekonomi, eller skapa underlag här när raderna är godkända." /> : <div className="divide-y divide-sand-100">{invoiceBases.map((invoice) => <article key={invoice.id} className="p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-ink-900">{invoice.reference}</p><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${invoice.status === "approved" || invoice.status === "exported" ? "bg-petroleum-50 text-petroleum-800" : "bg-sand-100 text-ink-600"}`}>{statusLabels[invoice.status] || invoice.status}</span></div><p className="mt-1 text-xs text-ink-400">{dateTime.format(new Date(invoice.created_at))} · Moms {invoice.vat_rate}%</p>{invoice.approved_at ? <p className="mt-1 text-xs font-medium text-petroleum-700">Godkänt {dateTime.format(new Date(invoice.approved_at))}</p> : null}</div><p className="text-lg font-semibold text-petroleum-800">{money.format(invoice.total)}</p></div><div className="mt-4 grid grid-cols-3 gap-3 rounded-xl bg-sand-50 p-3 text-xs"><div><p className="text-ink-400">Exkl. moms</p><p className="mt-1 font-semibold text-ink-800">{money.format(invoice.subtotal)}</p></div><div><p className="text-ink-400">Moms</p><p className="mt-1 font-semibold text-ink-800">{money.format(invoice.vat_amount)}</p></div><div><p className="text-ink-400">Totalt</p><p className="mt-1 font-semibold text-ink-800">{money.format(invoice.total)}</p></div></div>{invoice.status === "draft" ? <button type="button" disabled={saving} onClick={() => void post({ action: "invoice.approve", invoiceId: invoice.id }, "Rapportsnapshoten är godkänd.")} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-petroleum-800 px-4 text-xs font-semibold text-white hover:bg-petroleum-900 disabled:opacity-60"><BadgeCheck className="h-3.5 w-3.5" />Godkänn snapshot</button> : null}</article>)}</div>}
        </Panel>
      </div>
    </div>
  );
}
