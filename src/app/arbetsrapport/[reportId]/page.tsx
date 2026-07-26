"use client";

import { readResponseJson } from "@/lib/fetch-json";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Printer } from "lucide-react";

type Snapshot = {
  generatedAt?: string;
  workOrder?: {
    id: string;
    title: string;
    description: string;
    status: string;
    priority: string;
    actual_cost?: string | number | null;
    property?: { name: string; address: string; city: string };
    unit?: { designation: string } | null;
    assigned_to?: { name: string | null; email: string } | null;
  };
  checklist?: Array<{ title: string; description?: string | null; is_required: boolean; completed_at?: string | null }>;
  entries?: Array<{
    entry_type: string;
    description: string;
    quantity?: number;
    unit?: string | null;
    total_amount?: number;
    minutes?: number | null;
    distance_km?: number | null;
    supplier?: string | null;
    occurred_at?: string;
  }>;
  documents?: Array<{ id: string; file_name: string; category: string; created_at: string; download_url?: string; storage_url?: string }>;
  signatures?: Array<{ signer_role: string; signer_name: string; signer_email?: string | null; confirmation_text: string; signed_at: string }>;
};

type Report = {
  id: string;
  work_order_id: string;
  version: number;
  status: string;
  title: string;
  snapshot: Snapshot;
  approved_at: string | null;
  created_at: string;
};

const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat("sv-SE", { dateStyle: "long", timeStyle: "short" });
const roleLabels: Record<string, string> = { executor: "Utförare", contractor: "Entreprenör", customer: "Beställare" };
const entryLabels: Record<string, string> = { time: "Arbetstid", material: "Material", travel: "Resa", external: "Extern kostnad" };

export default function WorkOrderReportPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const router = useRouter();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch(`/api/work-order-reports/${reportId}`, { cache: "no-store" });
        if (response.status === 401) { router.push("/login"); return; }
        const data = await readResponseJson(response);
        if (!response.ok) throw new Error(data.error || "Kunde inte hämta arbetsrapporten");
        if (active) setReport(data.report);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Kunde inte hämta arbetsrapporten");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [reportId, router]);

  if (loading) return <div className="mx-auto mt-16 h-[760px] max-w-4xl animate-pulse rounded-3xl bg-sand-100" />;
  if (!report) return <main className="mx-auto max-w-3xl p-8"><p className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">{error || "Rapporten hittades inte"}</p></main>;

  const snapshot = report.snapshot || {};
  const workOrder = snapshot.workOrder;
  const checklist = snapshot.checklist || [];
  const entries = snapshot.entries || [];
  const documents = snapshot.documents || [];
  const signatures = snapshot.signatures || [];
  const totalMinutes = entries.reduce((sum, entry) => sum + Number(entry.minutes || 0), 0);
  const subtotal = entries.reduce((sum, entry) => sum + Number(entry.total_amount || 0), 0);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return (
    <main className="min-h-screen bg-sand-50 px-4 py-8 text-ink-950 print:bg-white print:p-0">
      <div className="mx-auto mb-5 flex max-w-5xl items-center justify-between gap-4 print:hidden">
        <Link href={`/dashboard/arbetsorder/${report.work_order_id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-ink-600 hover:text-petroleum-800"><ArrowLeft className="h-4 w-4" />Till arbetsordern</Link>
        <button type="button" onClick={() => window.print()} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-petroleum-800 px-5 text-sm font-semibold text-white hover:bg-petroleum-900"><Printer className="h-4 w-4" />Skriv ut / Spara PDF</button>
      </div>

      <article className="mx-auto max-w-5xl rounded-3xl border border-sand-200 bg-white p-7 shadow-premium-sm print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none sm:p-10">
        <header className="flex flex-col gap-8 border-b border-sand-200 pb-8 sm:flex-row sm:items-start sm:justify-between">
          <div><p className="text-sm font-semibold uppercase tracking-[0.22em] text-petroleum-700">Revalta</p><h1 className="mt-3 text-3xl font-semibold tracking-tight">{report.title}</h1><p className="mt-2 text-sm text-ink-500">Version {report.version} · skapad {dateTime.format(new Date(report.created_at))}</p></div>
          <div className="rounded-2xl border border-sand-200 bg-sand-50 px-5 py-4 text-sm"><p className="text-ink-500">Status</p><p className="mt-1 font-semibold text-ink-900">{report.status === "approved" ? "Godkänd" : "Utkast"}</p>{report.approved_at ? <p className="mt-1 text-xs text-ink-400">{dateTime.format(new Date(report.approved_at))}</p> : null}</div>
        </header>

        <section className="grid gap-4 border-b border-sand-200 py-8 sm:grid-cols-2 lg:grid-cols-4">
          <div><p className="text-xs uppercase tracking-wide text-ink-400">Fastighet</p><p className="mt-2 font-semibold">{workOrder?.property?.name || "–"}</p><p className="mt-1 text-sm text-ink-500">{workOrder?.property ? `${workOrder.property.address}, ${workOrder.property.city}` : ""}</p></div>
          <div><p className="text-xs uppercase tracking-wide text-ink-400">Objekt</p><p className="mt-2 font-semibold">{workOrder?.unit?.designation || "Ej angivet"}</p></div>
          <div><p className="text-xs uppercase tracking-wide text-ink-400">Ansvarig</p><p className="mt-2 font-semibold">{workOrder?.assigned_to?.name || workOrder?.assigned_to?.email || "Ej tilldelad"}</p></div>
          <div><p className="text-xs uppercase tracking-wide text-ink-400">Rapporterad tid</p><p className="mt-2 font-semibold">{hours} h {minutes} min</p></div>
        </section>

        <section className="border-b border-sand-200 py-8"><h2 className="text-lg font-semibold">Arbetsorder</h2><h3 className="mt-4 font-semibold">{workOrder?.title || "–"}</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink-600">{workOrder?.description || "Ingen beskrivning."}</p></section>

        <section className="grid gap-8 border-b border-sand-200 py-8 lg:grid-cols-2">
          <div><h2 className="text-lg font-semibold">Checklista</h2><div className="mt-4 space-y-3">{checklist.length === 0 ? <p className="text-sm text-ink-500">Ingen checklista registrerad.</p> : checklist.map((item, index) => <div key={`${item.title}-${index}`} className="flex gap-3 rounded-xl border border-sand-200 p-4"><span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${item.completed_at ? "bg-petroleum-700 text-white" : "border border-sand-300 text-transparent"}`}>✓</span><div><p className="font-medium">{item.title}</p>{item.description ? <p className="mt-1 text-sm text-ink-500">{item.description}</p> : null}<p className="mt-1 text-xs text-ink-400">{item.is_required ? "Obligatorisk" : "Valfri"}</p></div></div>)}</div></div>
          <div><h2 className="text-lg font-semibold">Ekonomisk sammanställning</h2><div className="mt-4 rounded-2xl bg-sand-50 p-5"><div className="flex justify-between text-sm"><span className="text-ink-500">Registrerat utfall exkl. moms</span><strong>{money.format(subtotal)}</strong></div><div className="mt-3 flex justify-between text-sm"><span className="text-ink-500">Arbetsorderns faktiska kostnad</span><strong>{money.format(Number(workOrder?.actual_cost || 0))}</strong></div></div></div>
        </section>

        <section className="border-b border-sand-200 py-8"><h2 className="text-lg font-semibold">Tid, material och kostnader</h2>{entries.length === 0 ? <p className="mt-4 text-sm text-ink-500">Inga registreringar.</p> : <div className="mt-4 overflow-hidden rounded-2xl border border-sand-200"><table className="w-full text-left text-sm"><thead className="bg-sand-50 text-xs uppercase tracking-wide text-ink-500"><tr><th className="px-4 py-3">Typ</th><th className="px-4 py-3">Beskrivning</th><th className="px-4 py-3 text-right">Tid/mängd</th><th className="px-4 py-3 text-right">Belopp</th></tr></thead><tbody className="divide-y divide-sand-100">{entries.map((entry, index) => <tr key={`${entry.description}-${index}`}><td className="px-4 py-3 font-medium">{entryLabels[entry.entry_type] || entry.entry_type}</td><td className="px-4 py-3 text-ink-600">{entry.description}{entry.supplier ? ` · ${entry.supplier}` : ""}</td><td className="px-4 py-3 text-right text-ink-600">{entry.minutes ? `${entry.minutes} min` : entry.distance_km ? `${entry.distance_km} km` : entry.quantity ? `${entry.quantity} ${entry.unit || ""}` : "–"}</td><td className="px-4 py-3 text-right font-medium">{Number(entry.total_amount || 0) > 0 ? money.format(Number(entry.total_amount)) : "–"}</td></tr>)}</tbody></table></div>}</section>

        {documents.length > 0 ? <section className="border-b border-sand-200 py-8"><h2 className="text-lg font-semibold">Dokument och foton</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{documents.map((document) => <a key={document.id} href={document.download_url || `/api/work-orders/${report.work_order_id}/documents/${document.id}`} target="_blank" rel="noreferrer" className="rounded-xl border border-sand-200 p-4 text-sm font-medium text-petroleum-800 print:text-ink-700">{document.file_name}<span className="ml-2 text-xs font-normal text-ink-400">{document.category}</span></a>)}</div></section> : null}

        <section className="py-8"><h2 className="text-lg font-semibold">Signaturer</h2>{signatures.length === 0 ? <p className="mt-4 text-sm text-ink-500">Inga signaturer registrerade i denna rapportversion.</p> : <div className="mt-4 grid gap-4 sm:grid-cols-3">{signatures.map((signature, index) => <div key={`${signature.signer_role}-${index}`} className="rounded-2xl border border-sand-200 p-5"><p className="text-xs uppercase tracking-wide text-ink-400">{roleLabels[signature.signer_role] || signature.signer_role}</p><p className="mt-3 font-semibold">{signature.signer_name}</p><p className="mt-1 text-xs text-ink-500">{signature.signer_email || ""}</p><p className="mt-4 text-xs leading-5 text-ink-500">{signature.confirmation_text}</p><p className="mt-3 text-xs text-ink-400">{dateTime.format(new Date(signature.signed_at))}</p></div>)}</div>}</section>

        <footer className="border-t border-sand-200 pt-6 text-xs leading-5 text-ink-400">Rapporten är en fryst version från Revalta och speglar registrerade uppgifter vid skapandet. Rapport-ID: {report.id}</footer>
      </article>
    </main>
  );
}
