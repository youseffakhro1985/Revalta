import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { PrintHandoverReportButton } from "@/components/leasing/print-handover-report-button";
import { getCurrentUser } from "@/lib/current-user";
import { getLeaseHandoverReport } from "@/lib/lease-handover-report";
import { handoverChecklistKeys } from "@/lib/lease-handover";

const checklistLabels: Record<(typeof handoverChecklistKeys)[number], string> = {
  identity_verified: "Identitet kontrollerad", lease_signed: "Avtal signerat", contact_details_verified: "Kontaktuppgifter verifierade",
  insurance_confirmed: "Försäkring bekräftad", meter_reading_recorded: "Mätarställning registrerad", keys_handed_over: "Nycklar utlämnade",
  inspection_completed: "Besiktning genomförd", cleaning_approved: "Städning godkänd", keys_returned: "Nycklar återlämnade",
  final_meter_reading_recorded: "Slutlig mätarställning registrerad",
};
const conditionLabels: Record<string, string> = { approved: "Godkänd", remark: "Anmärkning", action_required: "Åtgärd krävs", not_inspected: "Ej kontrollerad" };
const statusLabels: Record<string, string> = { new: "Ny", planned: "Planerad", in_progress: "Pågår", waiting_material: "Väntar material", blocked: "Blockerad", completed: "Slutförd", invoiced: "Fakturerad", cancelled: "Makulerad" };
const date = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" });
const dateTime = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });

export default async function HandoverReportPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.company_id) notFound();
  const { id } = await params;
  const report = await getLeaseHandoverReport(user.company_id, id);
  if (!report) notFound();

  const linkedByItem = new Map(report.workOrders.map((link) => [link.itemId, link]));
  const address = [report.lease.property.address, report.lease.property.postal_code, report.lease.property.city].filter(Boolean).join(", ");

  return <main className="mx-auto max-w-5xl space-y-6 bg-white p-4 text-ink-900 print:max-w-none print:p-0 sm:p-8">
    <div className="print:hidden flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <Link href="/dashboard/uthyrning/overlamning" className="inline-flex items-center gap-2 text-sm font-semibold text-ink-500"><ArrowLeft className="h-4 w-4" />Till överlämningen</Link>
      <PrintHandoverReportButton />
    </div>

    <header className="border-b border-sand-200 pb-6">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-petroleum-700">Revalta · Överlämningsrapport</p>
      <h1 className="mt-2 text-3xl font-semibold">{report.lease.lease_number}</h1>
      <p className="mt-2 text-sm text-ink-500">Genererad {dateTime.format(new Date(report.generatedAt))}</p>
    </header>

    <Section title="Avtal och objekt">
      <Grid rows={[
        ["Fastighet", report.lease.property.name], ["Adress", address], ["Objekt", report.lease.unit.designation],
        ["Objekttyp", report.lease.unit.unit_type], ["Yta", report.lease.unit.area ? `${report.lease.unit.area} m²` : "—"],
        ["Avtalsperiod", `${report.lease.start_date ? date.format(report.lease.start_date) : "—"} – ${report.lease.end_date ? date.format(report.lease.end_date) : "Tills vidare"}`],
        ["Hyrespart", report.lease.lease_holder.name], ["Kontakt", [report.lease.lease_holder.email, report.lease.lease_holder.phone].filter(Boolean).join(" · ") || "—"],
      ]} />
    </Section>

    <Section title="Överlämning">
      {!report.handover ? <Empty text="Ingen överlämning är registrerad." /> : <>
        <Grid rows={[["Typ", report.handover.mode === "move_in" ? "Inflyttning" : "Avflyttning"], ["Version", String(report.handover.version)], ["Status", report.handover.completedAt ? "Slutförd" : "Pågående"], ["Senast uppdaterad", dateTime.format(new Date(report.handover.updatedAt))]]} />
        <div className="mt-5 grid gap-2 sm:grid-cols-2">{handoverChecklistKeys.map((key) => <div key={key} className="flex items-center justify-between rounded-lg border border-sand-200 px-3 py-2 text-sm"><span>{checklistLabels[key]}</span><strong>{report.handover?.checklist[key] ? "Ja" : "Nej"}</strong></div>)}</div>
        {report.handover.generalNote ? <p className="mt-4 whitespace-pre-wrap rounded-lg bg-sand-50 p-4 text-sm">{report.handover.generalNote}</p> : null}
      </>}
    </Section>

    <Section title="Nyckelregister">
      {!report.handover?.keys.length ? <Empty text="Inga nyckelposter är registrerade." /> : <Table headers={["Beteckning", "Totalt", "Utlämnade", "Återlämnade", "Avvikelse"]} rows={report.handover.keys.map((key) => [key.label, key.quantity, key.handedOut, key.returned, key.handedOut - key.returned])} />}
    </Section>

    <Section title="Besiktningspunkter">
      {!report.inspection?.items.length ? <Empty text="Inga detaljerade besiktningspunkter är registrerade." /> : <div className="space-y-3">{report.inspection.items.map((item) => {
        const link = linkedByItem.get(item.id);
        return <article key={item.id} className="break-inside-avoid rounded-xl border border-sand-200 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold">{item.area} · {item.component}</h3><p className="mt-1 text-sm text-ink-500">{conditionLabels[item.condition]} · {item.priority} prioritet</p></div><span className="rounded-full bg-sand-100 px-2.5 py-1 text-xs font-semibold">{item.resolved ? "Åtgärdad" : "Öppen"}</span></div>
          {item.description ? <p className="mt-3 whitespace-pre-wrap text-sm">{item.description}</p> : null}
          {item.recommendation ? <p className="mt-2 text-sm text-ink-600"><strong>Rekommendation:</strong> {item.recommendation}</p> : null}
          {link?.workOrder ? <p className="mt-2 text-sm text-petroleum-800"><strong>Arbetsorder:</strong> {link.workOrder.title} · {statusLabels[link.workOrder.status] || link.workOrder.status}</p> : null}
        </article>;
      })}</div>}
    </Section>

    <Section title="Revisionshistorik">
      {!report.audit.length ? <Empty text="Ingen revisionshistorik finns." /> : <Table headers={["Tid", "Händelse"]} rows={report.audit.map((item) => [dateTime.format(item.created_at), item.action])} />}
    </Section>
  </main>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) { return <section className="break-inside-avoid rounded-2xl border border-sand-200 p-5 print:rounded-none print:border-x-0 print:px-0"><h2 className="mb-4 text-lg font-semibold">{title}</h2>{children}</section>; }
function Grid({ rows }: { rows: Array<[string, string]> }) { return <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">{rows.map(([label, value]) => <div key={label}><dt className="text-xs font-semibold uppercase tracking-wide text-ink-400">{label}</dt><dd className="mt-1 text-sm font-medium">{value}</dd></div>)}</dl>; }
function Empty({ text }: { text: string }) { return <p className="text-sm text-ink-500">{text}</p>; }
function Table({ headers, rows }: { headers: string[]; rows: Array<Array<string | number>> }) { return <div className="overflow-hidden rounded-xl border border-sand-200"><table className="w-full text-left text-sm"><thead className="bg-sand-50"><tr>{headers.map((header) => <th key={header} className="px-3 py-2 font-semibold">{header}</th>)}</tr></thead><tbody className="divide-y divide-sand-100">{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-2">{cell}</td>)}</tr>)}</tbody></table></div>; }
