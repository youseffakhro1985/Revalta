"use client";

import { readResponseJson } from "@/lib/fetch-json";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, FileText, Inbox, MessageSquareText, RefreshCw, UsersRound } from "lucide-react";
import {
  EmptyState,
  InlineAlert,
  MetricCard,
  PageHeader,
  Panel,
  premiumFieldClass,
  premiumPrimaryButtonClass,
  premiumTextareaClass,
} from "@/components/dashboard/premium-ui";
import { OPERATIONS_STATUS_LABELS, PRIORITY_LABELS } from "@/lib/domain-labels";

type Lease = {
  id: string;
  lease_number: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  monthly_rent: number;
  property: { id: string; name: string; address: string; city: string };
  unit: { id: string; designation: string; unit_type: string };
  lease_holder: { id: string; name: string; contact_name: string | null; email: string | null; phone: string | null; party_type: string };
};

type Ticket = {
  id: string;
  public_reference: string | null;
  title: string;
  description: string;
  status: string;
  category: string;
  priority: string;
  reporter_name: string | null;
  reporter_email: string | null;
  reporter_phone: string | null;
  reporter_unit: string | null;
  created_at: string;
  updated_at: string;
  property: { id: string; name: string } | null;
  assigned_to: { id: string; name: string | null; email: string } | null;
};

type Payload = {
  leases: Lease[];
  tickets: Ticket[];
  canManage: boolean;
  canCreate?: boolean;
  isResident?: boolean;
};

const statusLabels = OPERATIONS_STATUS_LABELS;
const priorityLabels = PRIORITY_LABELS;
const categoryLabels: Record<string, string> = {
  maintenance: "Underhåll",
  plumbing: "Vatten och avlopp",
  electrical: "El",
  heating: "Värme och ventilation",
  access: "Nyckel och passage",
  noise: "Störning",
  other: "Övrigt",
};
const dateFormatter = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });
const moneyFormatter = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });

export default function ResidentPortalPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState({ leaseId: "", category: "other", priority: "normal", subject: "", message: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/resident-portal", { cache: "no-store" });
      const payload = await readResponseJson(response);
      if (!response.ok) throw new Error(payload.error || "Kunde inte hämta boendeportalen");
      setData(payload);
      setForm((current) => ({ ...current, leaseId: current.leaseId || payload.leases?.[0]?.id || "" }));
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte hämta boendeportalen");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/resident-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await readResponseJson(response);
      if (!response.ok) throw new Error(payload.error || "Kunde inte skapa boendeärendet");
      setForm((current) => ({ ...current, category: "other", priority: "normal", subject: "", message: "" }));
      setSuccess(`Ärendet har skapats${payload.ticket?.public_reference ? ` med referens ${payload.ticket.public_reference}` : ""}.`);
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte skapa boendeärendet");
    } finally {
      setSaving(false);
    }
  }

  const selectedLease = data?.leases.find((lease) => lease.id === form.leaseId) || null;
  const visible = useMemo(() => {
    if (!data) return [];
    const normalized = query.trim().toLowerCase();
    if (!normalized) return data.tickets;
    return data.tickets.filter((ticket) =>
      `${ticket.public_reference || ""} ${ticket.reporter_name || ""} ${ticket.property?.name || ""} ${ticket.reporter_unit || ""} ${ticket.title} ${ticket.description}`
        .toLowerCase()
        .includes(normalized),
    );
  }, [data, query]);

  const openCount = data?.tickets.filter((ticket) => !["resolved", "closed"].includes(ticket.status)).length || 0;
  const newCount = data?.tickets.filter((ticket) => ticket.status === "new").length || 0;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={data?.isResident ? "Min boendeservice" : "Boende och kundservice"}
        title={data?.isResident ? "Mina ärenden" : "Boendeportal"}
        description={data?.isResident
          ? "Skapa felanmälningar för ditt hyresavtal och följ statusen hos förvaltningen."
          : "Hantera boendes ärenden med direkt koppling till rätt hyresavtal, fastighet och lägenhet eller lokal."}
      />

      {error ? <InlineAlert>{error}</InlineAlert> : null}
      {success ? <InlineAlert tone="success">{success}</InlineAlert> : null}
      {data?.isResident && data.leases.length === 0 ? (
        <InlineAlert tone="info">
          Inget aktivt hyresavtal är kopplat till din e-postadress ännu. Kontakta förvaltningen om du behöver hjälp.
        </InlineAlert>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={UsersRound} label={data?.isResident ? "Mina avtal" : "Aktiva avtal"} value={data?.leases.length || 0} hint={data?.isResident ? "Kopplade till din e-post" : "Boende och hyresparter"} />
        <MetricCard icon={MessageSquareText} label="Öppna ärenden" value={openCount} hint="Kräver fortsatt hantering" />
        <MetricCard icon={Inbox} label="Nya ärenden" value={newCount} hint="Ännu inte handlagda" />
        <MetricCard icon={FileText} label="Portalärenden totalt" value={data?.tickets.length || 0} hint="Riktiga ärendeposter" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <Panel
          title={data?.isResident ? "Skapa felanmälan" : "Registrera boendeärende"}
          description={data?.isResident
            ? "Beskriv problemet. Avtal, lägenhet och kontaktuppgifter kopplas automatiskt."
            : "Välj ett aktivt avtal. Boende, fastighet och objekt kopplas automatiskt till ärendet."}
        >
          {loading ? <div className="h-72 animate-pulse rounded-xl bg-sand-100" /> : !(data?.canCreate ?? data?.canManage) ? (
            <InlineAlert>Du har läsbehörighet men saknar rättighet att skapa nya boendeärenden.</InlineAlert>
          ) : data.leases.length === 0 ? (
            <EmptyState
              title="Inga aktiva hyresavtal"
              description={data.isResident
                ? "När ditt avtal är kopplat till din e-post kan du skapa felanmälningar här."
                : "Skapa eller aktivera ett hyresavtal i uthyrningsmodulen innan ett avtalskopplat boendeärende registreras."}
            />
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-ink-700">Hyresavtal och objekt</span>
                <select required value={form.leaseId} onChange={(event) => setForm({ ...form, leaseId: event.target.value })} className={premiumFieldClass}>
                  {data.leases.map((lease) => (
                    <option key={lease.id} value={lease.id}>
                      {lease.property.name} · {lease.unit.designation} · {lease.lease_holder.name}
                    </option>
                  ))}
                </select>
              </label>

              {selectedLease ? (
                <div className="rounded-xl border border-sand-200 bg-sand-50/70 p-4">
                  <div className="flex items-start gap-3">
                    <Building2 className="mt-0.5 h-4 w-4 text-petroleum-700" />
                    <div className="min-w-0">
                      <p className="font-semibold text-ink-900">{selectedLease.lease_holder.name}</p>
                      <p className="mt-1 text-xs leading-5 text-ink-500">
                        {selectedLease.property.name} · {selectedLease.unit.designation}<br />
                        Avtal {selectedLease.lease_number} · {moneyFormatter.format(selectedLease.monthly_rent)}/mån
                      </p>
                      <p className="mt-1 text-xs text-ink-500">{selectedLease.lease_holder.email || selectedLease.lease_holder.phone || "Kontaktuppgift saknas"}</p>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-ink-700">Kategori</span>
                  <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className={premiumFieldClass}>
                    {Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-ink-700">Prioritet</span>
                  <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })} className={premiumFieldClass}>
                    {Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
              </div>

              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-ink-700">Ämne</span>
                <input required maxLength={200} placeholder="Exempel: Läckage under diskbänk" value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} className={premiumFieldClass} />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-ink-700">Beskrivning</span>
                <textarea required minLength={10} maxLength={5000} placeholder="Beskriv problemet, när det började och om någon akut risk finns." value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} className={premiumTextareaClass} />
              </label>
              <button disabled={saving || !form.leaseId} className={`${premiumPrimaryButtonClass} w-full`}>
                {saving ? "Skapar ärende…" : data.isResident ? "Skicka felanmälan" : "Skapa boendeärende"}
              </button>
            </form>
          )}
        </Panel>

        <Panel
          title="Ärendehistorik"
          description={data?.isResident ? "Dina felanmälningar och deras aktuella status." : "Sök och öppna alla ärenden som har skapats genom boendeportalen."}
          bodyClassName="p-0"
        >
          <div className="flex flex-col gap-3 border-b border-sand-200 p-5 sm:flex-row">
            <input placeholder="Sök referens, boende, fastighet, objekt eller ämne" aria-label="Sök referens, boende, fastighet, objekt eller ämne" value={query} onChange={(event) => setQuery(event.target.value)} className={premiumFieldClass} />
            <button type="button" onClick={() => void load()} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-sand-200 bg-white px-4 py-2 text-sm font-semibold text-ink-700 shadow-sm hover:bg-sand-50">
              <RefreshCw className="h-4 w-4" /> Uppdatera
            </button>
          </div>

          {loading ? (
            <div className="space-y-3 p-6">{[1, 2, 3].map((item) => <div key={item} className="h-28 animate-pulse rounded-xl bg-sand-100" />)}</div>
          ) : visible.length === 0 ? (
            <EmptyState title="Inga boendeärenden" description="När ett avtalskopplat ärende skapas visas det här med full status och handläggning." />
          ) : (
            <div className="divide-y divide-sand-100">
              {visible.map((ticket) => (
                <article key={ticket.id} className="grid gap-4 p-6 transition hover:bg-sand-50/70 lg:grid-cols-[1.1fr_1.5fr_auto] lg:items-center">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-petroleum-700">
                      {ticket.public_reference || "Utan referens"} · {ticket.property?.name || "Ingen fastighet"}{ticket.reporter_unit ? ` · ${ticket.reporter_unit}` : ""}
                    </p>
                    <h3 className="mt-1 font-semibold text-ink-900">{ticket.reporter_name || "Okänd boende"}</h3>
                    <p className="mt-1 text-xs text-ink-500">{ticket.reporter_email || ticket.reporter_phone || "Kontaktuppgift saknas"}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-ink-800">{ticket.title}</p>
                    <p className="mt-1 line-clamp-2 text-sm leading-6 text-ink-500">{ticket.description}</p>
                    <p className="mt-2 text-xs text-ink-500">
                      {categoryLabels[ticket.category] || ticket.category} · {priorityLabels[ticket.priority] || ticket.priority} · {dateFormatter.format(new Date(ticket.created_at))}
                    </p>
                  </div>
                  <div className="flex flex-col items-start gap-2 lg:items-end">
                    <span className="rounded-full bg-petroleum-50 px-3 py-1 text-xs font-semibold text-petroleum-800">{statusLabels[ticket.status] || ticket.status}</span>
                    {data?.isResident ? (
                      <Link
                        href={`/dashboard/boendeportal/arenden/${ticket.id}`}
                        className="text-xs font-semibold text-petroleum-800 hover:text-petroleum-950"
                      >
                        Visa ärende
                      </Link>
                    ) : (
                      <Link href={`/dashboard/felanmalan/${ticket.id}`} className="text-xs font-semibold text-petroleum-800 hover:text-petroleum-950">Öppna ärendet</Link>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </Panel>
      </section>
    </div>
  );
}
