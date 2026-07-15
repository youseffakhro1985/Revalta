import { Prisma } from "@prisma/client";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import db from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { InvoicePrintButton } from "@/components/dashboard/invoice-print-button";

const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", minimumFractionDigits: 2 });
const date = new Intl.DateTimeFormat("sv-SE", { dateStyle: "long" });

type Row = Record<string, unknown>;

export default async function InvoiceDraftPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.company_id) notFound();
  const { id } = await params;

  const drafts = await db.$queryRaw<Row[]>(Prisma.sql`
    SELECT d.*, w."work_order_number", w."title" AS "work_order_title",
      p."name" AS "property_name", p."address" AS "property_address", p."city" AS "property_city",
      c."name" AS "company_name"
    FROM "WorkOrderInvoiceDraft" d
    JOIN "WorkOrder" w ON w."id" = d."work_order_id"
    JOIN "Property" p ON p."id" = w."property_id"
    JOIN "Company" c ON c."id" = d."company_id"
    WHERE d."work_order_id" = ${id} AND d."company_id" = ${user.company_id}
    LIMIT 1
  `);
  const draft = drafts[0];
  if (!draft) notFound();

  const lines = await db.$queryRaw<Row[]>(Prisma.sql`
    SELECT "description", "quantity"::double precision AS "quantity", "unit",
      "unit_price_ex_vat"::double precision AS "unit_price_ex_vat",
      "vat_rate"::double precision AS "vat_rate", "line_total_ex_vat"::double precision AS "line_total_ex_vat"
    FROM "WorkOrderInvoiceDraftLine"
    WHERE "invoice_draft_id" = ${String(draft.id)}
    ORDER BY "sort_order", "id"
  `);

  return <main className="mx-auto max-w-5xl space-y-8 bg-white px-6 py-8 text-ink-950 print:max-w-none print:px-0 print:py-0">
    <div className="flex flex-wrap items-center justify-between gap-4 print:hidden">
      <Link href={`/dashboard/arbetsorder/${id}`} className="text-sm font-semibold text-petroleum-800 hover:text-petroleum-950">Tillbaka till arbetsordern</Link>
      <InvoicePrintButton />
    </div>

    <header className="border-b border-sand-300 pb-8">
      <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-petroleum-700">Revalta faktureringsunderlag</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">{String(draft.draft_number)}</h1>
          <p className="mt-2 text-sm text-ink-500">Skapat {date.format(new Date(String(draft.created_at)))}</p>
        </div>
        <div className="text-sm leading-6 sm:text-right">
          <p className="font-semibold">{String(draft.company_name)}</p>
          <p className="text-ink-500">Underlag för ekonomisk hantering</p>
        </div>
      </div>
    </header>

    <section className="grid gap-6 sm:grid-cols-2">
      <div className="rounded-2xl border border-sand-200 p-5 print:rounded-none">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Kund / kostnadsbärare</p>
        <p className="mt-2 font-semibold">{draft.customer_name ? String(draft.customer_name) : "Ej angiven"}</p>
        <p className="mt-1 text-sm text-ink-500">Referens: {draft.customer_reference ? String(draft.customer_reference) : "Ej angiven"}</p>
      </div>
      <div className="rounded-2xl border border-sand-200 p-5 print:rounded-none">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Arbetsorder och fastighet</p>
        <p className="mt-2 font-semibold">{String(draft.work_order_number || draft.work_order_title)}</p>
        <p className="mt-1 text-sm text-ink-500">{String(draft.property_name)}, {String(draft.property_address)}, {String(draft.property_city)}</p>
      </div>
    </section>

    <section className="overflow-hidden rounded-2xl border border-sand-200 print:rounded-none">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-sand-50 text-left text-xs uppercase tracking-wide text-ink-500">
          <tr><th className="px-4 py-3">Beskrivning</th><th className="px-4 py-3 text-right">Antal</th><th className="px-4 py-3">Enhet</th><th className="px-4 py-3 text-right">Á-pris</th><th className="px-4 py-3 text-right">Moms</th><th className="px-4 py-3 text-right">Belopp</th></tr>
        </thead>
        <tbody className="divide-y divide-sand-100">
          {lines.map((line, index) => <tr key={`${String(line.description)}-${index}`}>
            <td className="px-4 py-3 font-medium">{String(line.description)}</td>
            <td className="px-4 py-3 text-right">{Number(line.quantity).toLocaleString("sv-SE")}</td>
            <td className="px-4 py-3">{line.unit ? String(line.unit) : "–"}</td>
            <td className="px-4 py-3 text-right">{money.format(Number(line.unit_price_ex_vat || 0))}</td>
            <td className="px-4 py-3 text-right">{Number(line.vat_rate || 0).toLocaleString("sv-SE")} %</td>
            <td className="px-4 py-3 text-right font-semibold">{money.format(Number(line.line_total_ex_vat || 0))}</td>
          </tr>)}
        </tbody>
      </table>
    </section>

    <section className="ml-auto max-w-md space-y-3 border-t border-sand-300 pt-5 text-sm">
      <div className="flex justify-between"><span className="text-ink-500">Summa exkl. moms</span><strong>{money.format(Number(draft.subtotal_ex_vat || 0))}</strong></div>
      <div className="flex justify-between"><span className="text-ink-500">Moms</span><strong>{money.format(Number(draft.vat_amount || 0))}</strong></div>
      <div className="flex justify-between border-t border-sand-300 pt-3 text-lg"><span>Summa inkl. moms</span><strong>{money.format(Number(draft.total_inc_vat || 0))}</strong></div>
    </section>

    {draft.notes ? <section className="rounded-2xl border border-sand-200 bg-sand-50 p-5 print:rounded-none"><p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Anteckning</p><p className="mt-2 text-sm leading-6">{String(draft.notes)}</p></section> : null}

    <footer className="border-t border-sand-200 pt-5 text-xs text-ink-400">
      Genererat i Revalta. Underlaget är inte en bokförd faktura förrän det registrerats i ekonomisystemet.
    </footer>
  </main>;
}
