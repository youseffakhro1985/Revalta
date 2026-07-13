"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Banknote, CheckSquare2, Clock3, FileText, MapPin } from "lucide-react";

type Ticket = {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  due_date: string | null;
  created_at: string;
  property: { id: string; name: string; address: string; city: string } | null;
  assigned_to: { id: string; name: string | null; email: string } | null;
};

type Operation = {
  id: string;
  action: string;
  metadata: {
    type?: string;
    description?: string | null;
    minutes?: number | null;
    amount?: number | null;
    completed?: boolean | null;
  } | null;
  created_at: string;
  actor: { name: string | null; email: string } | null;
};

const statusLabels: Record<string, string> = {
  new: "Ny",
  received: "Mottagen",
  in_progress: "Pågår",
  waiting: "Väntar",
  completed: "Klar för kontroll",
  closed: "Stängd",
};

const currency = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });

export default function WorkOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [time, setTime] = useState({ minutes: "", description: "" });
  const [cost, setCost] = useState({ amount: "", description: "" });
  const [checklist, setChecklist] = useState({ description: "", completed: false });
  const [note, setNote] = useState("");

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const [ticketResponse, operationsResponse] = await Promise.all([
          fetch(`/api/tickets/${params.id}`, { cache: "no-store" }),
          fetch(`/api/tickets/${params.id}/operations`, { cache: "no-store" }),
        ]);
        if (ticketResponse.status === 401 || operationsResponse.status === 401) {
          router.push("/login");
          return;
        }
        const [ticketData, operationsData] = await Promise.all([ticketResponse.json(), operationsResponse.json()]);
        if (!ticketResponse.ok) throw new Error(ticketData.error || "Kunde inte hämta arbetsordern");
        if (!operationsResponse.ok) throw new Error(operationsData.error || "Kunde inte hämta historiken");
        if (mounted) {
          setTicket(ticketData.ticket);
          setOperations(operationsData.operations || []);
        }
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : "Kunde inte hämta arbetsordern");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [params.id, router]);

  const totals = useMemo(() => {
    return operations.reduce((sum, operation) => {
      const metadata = operation.metadata || {};
      return {
        minutes: sum.minutes + (metadata.minutes || 0),
        amount: sum.amount + (metadata.amount || 0),
        checklist: sum.checklist + (metadata.type === "checklist" ? 1 : 0),
        completed: sum.completed + (metadata.type === "checklist" && metadata.completed ? 1 : 0),
      };
    }, { minutes: 0, amount: 0, checklist: 0, completed: 0 });
  }, [operations]);

  async function addOperation(payload: Record<string, unknown>, reset: () => void) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/tickets/${params.id}/operations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunde inte spara registreringen");
      if (data.operation) setOperations((current) => [data.operation, ...current]);
      reset();
      setMessage("Registreringen har sparats i arbetsorderns historik.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte spara registreringen");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="h-96 animate-pulse rounded-2xl bg-sand-100" />;
  if (!ticket) return <div className="rounded-2xl border border-danger-500 bg-danger-50 p-6 text-danger-600">{error || "Arbetsordern hittades inte"}</div>;

  return (
    <div className="animate-fade-in-soft space-y-6">
      <Link href="/dashboard/arbetsorder" className="inline-flex items-center gap-2 text-sm font-semibold text-ink-500 transition hover:text-petroleum-800"><ArrowLeft className="h-4 w-4" /> Till arbetsordrar</Link>

      {(error || message) && <div className={`rounded-2xl border p-4 text-sm font-medium ${error ? "border-danger-500 bg-danger-50 text-danger-600" : "border-success-500 bg-success-50 text-success-600"}`}>{error || message}</div>}

      <header className="rounded-2xl border border-sand-200 bg-white p-7 shadow-premium-sm sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-petroleum-600">Arbetsorder</p>
            <h1 className="text-[30px] font-semibold tracking-[-0.035em] text-ink-950 sm:text-[34px]">{ticket.title}</h1>
            <p className="mt-3 max-w-3xl leading-7 text-ink-600">{ticket.description}</p>
            {ticket.property && <p className="mt-4 flex items-center gap-2 text-sm font-medium text-ink-500"><MapPin className="h-4 w-4 text-petroleum-700" />{ticket.property.name} · {ticket.property.address}, {ticket.property.city}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-petroleum-200 bg-petroleum-50 px-3 py-1 text-xs font-semibold text-petroleum-700">{statusLabels[ticket.status] || ticket.status}</span>
            <span className="rounded-full border border-sand-200 bg-sand-50 px-3 py-1 text-xs font-semibold text-ink-600">{ticket.assigned_to?.name || ticket.assigned_to?.email || "Ej tilldelad"}</span>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Rapporterad tid", value: `${Math.floor(totals.minutes / 60)} h ${totals.minutes % 60} min`, icon: Clock3 },
          { label: "Registrerad kostnad", value: currency.format(totals.amount), icon: Banknote },
          { label: "Checklistor", value: `${totals.completed}/${totals.checklist}`, icon: CheckSquare2 },
          { label: "Historikhändelser", value: operations.length, icon: FileText },
        ].map((item) => {
          const Icon = item.icon;
          return <article key={item.label} className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-ink-500">{item.label}</p><p className="mt-2 text-xl font-semibold tracking-[-0.03em] text-ink-950">{item.value}</p></div><div className="rounded-xl bg-sand-50 p-3 text-petroleum-700"><Icon className="h-5 w-5" /></div></div></article>;
        })}
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-sand-200 bg-white p-6 shadow-premium-sm">
            <h2 className="text-lg font-semibold text-ink-950">Registrera arbetstid</h2>
            <form onSubmit={(event) => { event.preventDefault(); addOperation({ type: "time", minutes: Number(time.minutes), description: time.description }, () => setTime({ minutes: "", description: "" })); }} className="mt-5 space-y-4">
              <input type="number" min="1" max="1440" required value={time.minutes} onChange={(event) => setTime((current) => ({ ...current, minutes: event.target.value }))} placeholder="Minuter" className="w-full rounded-lg border border-sand-200 px-3 py-2.5 text-sm outline-none focus:border-petroleum-500" />
              <input value={time.description} onChange={(event) => setTime((current) => ({ ...current, description: event.target.value }))} placeholder="Beskriv utfört arbete" className="w-full rounded-lg border border-sand-200 px-3 py-2.5 text-sm outline-none focus:border-petroleum-500" />
              <button disabled={busy} className="rounded-lg bg-petroleum-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">Spara tid</button>
            </form>
          </section>

          <section className="rounded-2xl border border-sand-200 bg-white p-6 shadow-premium-sm">
            <h2 className="text-lg font-semibold text-ink-950">Registrera kostnad</h2>
            <form onSubmit={(event) => { event.preventDefault(); addOperation({ type: "cost", amount: Number(cost.amount), description: cost.description }, () => setCost({ amount: "", description: "" })); }} className="mt-5 space-y-4">
              <input type="number" min="0" step="0.01" required value={cost.amount} onChange={(event) => setCost((current) => ({ ...current, amount: event.target.value }))} placeholder="Belopp exkl. moms" className="w-full rounded-lg border border-sand-200 px-3 py-2.5 text-sm outline-none focus:border-petroleum-500" />
              <input value={cost.description} onChange={(event) => setCost((current) => ({ ...current, description: event.target.value }))} placeholder="Material, leverantör eller övrig kostnad" className="w-full rounded-lg border border-sand-200 px-3 py-2.5 text-sm outline-none focus:border-petroleum-500" />
              <button disabled={busy} className="rounded-lg bg-petroleum-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">Spara kostnad</button>
            </form>
          </section>

          <section className="rounded-2xl border border-sand-200 bg-white p-6 shadow-premium-sm">
            <h2 className="text-lg font-semibold text-ink-950">Checklista och anteckning</h2>
            <form onSubmit={(event) => { event.preventDefault(); addOperation({ type: "checklist", description: checklist.description, completed: checklist.completed }, () => setChecklist({ description: "", completed: false })); }} className="mt-5 space-y-4">
              <input required value={checklist.description} onChange={(event) => setChecklist((current) => ({ ...current, description: event.target.value }))} placeholder="Kontrollpunkt" className="w-full rounded-lg border border-sand-200 px-3 py-2.5 text-sm outline-none focus:border-petroleum-500" />
              <label className="flex items-center gap-3 text-sm text-ink-600"><input type="checkbox" checked={checklist.completed} onChange={(event) => setChecklist((current) => ({ ...current, completed: event.target.checked }))} /> Markera som genomförd</label>
              <button disabled={busy} className="rounded-lg border border-sand-200 bg-sand-50 px-4 py-2.5 text-sm font-semibold text-ink-800 disabled:opacity-60">Lägg till kontrollpunkt</button>
            </form>
            <form onSubmit={(event) => { event.preventDefault(); addOperation({ type: "note", description: note }, () => setNote("")); }} className="mt-6 border-t border-sand-100 pt-6">
              <textarea required rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Intern arbetsanteckning" className="w-full rounded-lg border border-sand-200 px-3 py-2.5 text-sm outline-none focus:border-petroleum-500" />
              <button disabled={busy} className="mt-3 rounded-lg border border-sand-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-800 disabled:opacity-60">Spara anteckning</button>
            </form>
          </section>
        </div>

        <section className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-premium-sm">
          <div className="border-b border-sand-200 px-6 py-5"><h2 className="text-xl font-semibold text-ink-950">Arbetshistorik</h2><p className="mt-1 text-sm text-ink-500">Tid, kostnader, checklistor och anteckningar i kronologisk ordning.</p></div>
          {operations.length > 0 ? <div className="divide-y divide-sand-100">{operations.map((operation) => {
            const metadata = operation.metadata || {};
            const type = metadata.type || operation.action.split(".")[1] || "note";
            const title = type === "time" ? "Arbetstid" : type === "cost" ? "Kostnad" : type === "checklist" ? "Kontrollpunkt" : "Anteckning";
            const value = type === "time" ? `${metadata.minutes || 0} minuter` : type === "cost" ? currency.format(metadata.amount || 0) : type === "checklist" ? (metadata.completed ? "Genomförd" : "Ej genomförd") : null;
            return <article key={operation.id} className="px-6 py-5"><div className="flex items-start justify-between gap-4"><div><p className="font-semibold text-ink-900">{title}</p>{metadata.description && <p className="mt-1 text-sm leading-6 text-ink-600">{metadata.description}</p>}<p className="mt-2 text-xs text-ink-400">{operation.actor?.name || operation.actor?.email || "System"} · {dateTime.format(new Date(operation.created_at))}</p></div>{value && <span className="shrink-0 rounded-full border border-sand-200 bg-sand-50 px-2.5 py-1 text-xs font-semibold text-ink-600">{value}</span>}</div></article>;
          })}</div> : <div className="p-12 text-center"><p className="font-semibold text-ink-800">Ingen arbetshistorik ännu</p><p className="mt-2 text-sm text-ink-500">Registrera tid, kostnad eller en kontrollpunkt för att börja.</p></div>}
        </section>
      </div>
    </div>
  );
}
