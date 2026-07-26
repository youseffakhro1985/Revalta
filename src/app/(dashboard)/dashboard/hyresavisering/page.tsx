"use client";

import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, CalendarClock, CircleDollarSign } from "lucide-react";
import { EmptyState, InlineAlert, MetricCard, PageHeader, Panel, premiumFieldClass, premiumPrimaryButtonClass, premiumTextareaClass } from "@/components/dashboard/premium-ui";

type Lease = { id: string; property_id?: string; property_name?: string; tenant_name?: string; unit?: string; monthly_rent?: number; status?: string };
type Property = { id: string; name: string };
type Notice = {
  id: string;
  property_name?: string;
  tenant_name?: string;
  unit?: string;
  period?: string;
  due_date?: string;
  status?: string;
  index_percent?: number;
  total?: number;
  created_at: string;
  source?: "table" | "legacy";
};
const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const labels: Record<string, string> = { draft: "Utkast", sent: "Skickad", paid: "Betald", overdue: "Förfallen", credited: "Krediterad" };

export default function RentNoticesPage() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [leases, setLeases] = useState<Lease[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState({ propertyId: "", leaseId: "", tenantName: "", unit: "", period: "", dueDate: "", status: "draft", baseRent: "", additions: "", deductions: "", indexPercent: "0", note: "" });

  async function load() {
    setLoading(true);
    const response = await fetch("/api/rent-notices", { cache: "no-store" });
    const data = await response.json();
    if (response.ok) {
      setNotices(data.notices || []);
      setLeases(data.leases || []);
      setProperties(data.properties || []);
    } else setError(data.error || "Kunde inte hämta hyresavier");
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  const summary = useMemo(() => ({
    total: notices.reduce((sum, item) => sum + Number(item.total || 0), 0),
    paid: notices.filter((item) => item.status === "paid").reduce((sum, item) => sum + Number(item.total || 0), 0),
    overdue: notices.filter((item) => item.status === "overdue" || (item.due_date && new Date(item.due_date) < new Date() && item.status !== "paid" && item.status !== "credited")).length,
  }), [notices]);

  function selectLease(leaseId: string) {
    const lease = leases.find((item) => item.id === leaseId);
    setForm((current) => ({
      ...current,
      leaseId,
      propertyId: lease?.property_id || current.propertyId,
      tenantName: lease?.tenant_name || "",
      unit: lease?.unit || "",
      baseRent: String(lease?.monthly_rent || ""),
    }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    const response = await fetch("/api/rent-notices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await response.json();
    if (!response.ok) setError(data.error || "Kunde inte skapa hyresavin");
    else {
      setForm({ propertyId: "", leaseId: "", tenantName: "", unit: "", period: "", dueDate: "", status: "draft", baseRent: "", additions: "", deductions: "", indexPercent: "0", note: "" });
      setSuccess("Hyresavin har skapats.");
      await load();
    }
    setSaving(false);
  }

  async function updateStatus(notice: Notice, status: string) {
    if (notice.source === "legacy") {
      setError("Hyresavin finns i äldre lagring. Kör backfill till RentNotice innan status ändras.");
      return;
    }
    if (status === notice.status) return;
    setUpdatingId(notice.id);
    setError("");
    setSuccess("");
    const response = await fetch("/api/rent-notices", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noticeId: notice.id, status }),
    });
    const data = await response.json();
    if (!response.ok) setError(data.error || "Kunde inte uppdatera status");
    else {
      setSuccess("Avis status har uppdaterats.");
      await load();
    }
    setUpdatingId("");
  }

  return <div className="space-y-8">
    <PageHeader eyebrow="Hyresadministration" title="Hyresavisering och index" description="Skapa hyresavier, hantera indexuppräkning och följ betalningsstatus per objekt och period." />
    <section className="grid gap-4 md:grid-cols-3">
      <MetricCard icon={CircleDollarSign} label="Aviserat totalt" value={money.format(summary.total)} />
      <MetricCard icon={BadgeCheck} label="Betalt" value={money.format(summary.paid)} />
      <MetricCard icon={CalendarClock} label="Förfallna" value={String(summary.overdue)} />
    </section>
    {(error || success) ? <InlineAlert tone={error ? "error" : "success"}>{error || success}</InlineAlert> : null}
    <section className="grid gap-6 xl:grid-cols-[390px_1fr]">
      <Panel title="Ny hyresavi" description="Utgå från ett aktivt kontrakt eller registrera uppgifterna manuellt.">
        <form onSubmit={submit} className="space-y-4">
          <select className={premiumFieldClass} value={form.leaseId} onChange={(e) => selectLease(e.target.value)}>
            <option value="">Välj kontrakt</option>
            {leases.filter((lease) => lease.status === "active" || lease.status === "notice").map((lease) => (
              <option key={lease.id} value={lease.id}>{lease.property_name} · {lease.unit} · {lease.tenant_name || "Ingen hyresgäst"}</option>
            ))}
          </select>
          <select className={premiumFieldClass} value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })} required>
            <option value="">Välj fastighet</option>
            {properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
          </select>
          <div className="grid gap-3 sm:grid-cols-2">
            <input className={premiumFieldClass} placeholder="Hyresgäst" value={form.tenantName} onChange={(e) => setForm({ ...form, tenantName: e.target.value })} />
            <input className={premiumFieldClass} placeholder="Objekt" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <input className={premiumFieldClass} type="month" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} required />
            <input className={premiumFieldClass} type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} required />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <input className={premiumFieldClass} type="number" min="0" placeholder="Grundhyra" value={form.baseRent} onChange={(e) => setForm({ ...form, baseRent: e.target.value })} />
            <input className={premiumFieldClass} type="number" min="0" step="0.01" placeholder="Index %" value={form.indexPercent} onChange={(e) => setForm({ ...form, indexPercent: e.target.value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <input className={premiumFieldClass} type="number" min="0" placeholder="Tillägg" value={form.additions} onChange={(e) => setForm({ ...form, additions: e.target.value })} />
            <input className={premiumFieldClass} type="number" min="0" placeholder="Avdrag" value={form.deductions} onChange={(e) => setForm({ ...form, deductions: e.target.value })} />
          </div>
          <select className={premiumFieldClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <textarea className={premiumTextareaClass} placeholder="Anteckning" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          <button disabled={saving} className={`${premiumPrimaryButtonClass} w-full`}>{saving ? "Sparar…" : "Skapa hyresavi"}</button>
        </form>
      </Panel>
      <Panel title="Avier och betalningsläge" description="Samlad översikt över perioder, förfallodatum och betalningsstatus." bodyClassName="p-0">
        {loading ? <p className="p-6 text-sm text-ink-500">Hämtar hyresavier…</p> : notices.length === 0 ? (
          <EmptyState title="Inga hyresavier registrerade" description="Skapa den första hyresavin för att börja följa avisering och betalningsläge." />
        ) : (
          <div className="divide-y divide-sand-100">
            {notices.map((notice) => (
              <article key={notice.id} className="p-5 transition hover:bg-sand-50/60 sm:p-6">
                <div className="flex flex-col justify-between gap-4 sm:flex-row">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-ink-900">{notice.tenant_name || "Hyresavi"}</h3>
                      <span className="rounded-full bg-sand-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-ink-600">
                        {labels[notice.status || "draft"]}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-ink-500">{notice.property_name}{notice.unit ? ` · ${notice.unit}` : ""}</p>
                    <p className="mt-2 text-xs text-ink-400">Period {notice.period || "–"} · Förfaller {notice.due_date || "–"}</p>
                    {notice.source === "legacy" ? (
                      <p className="mt-2 text-xs font-medium text-amber-800">Äldre rad – kör backfill innan status kan ändras.</p>
                    ) : null}
                  </div>
                  <div className="space-y-2 sm:text-right">
                    <p className="text-xl font-semibold text-ink-900">{money.format(Number(notice.total || 0))}</p>
                    <p className="text-xs text-ink-400">Index {Number(notice.index_percent || 0).toLocaleString("sv-SE")} %</p>
                    {notice.source !== "legacy" ? (
                      <select
                        disabled={updatingId === notice.id}
                        value={notice.status || "draft"}
                        onChange={(event) => void updateStatus(notice, event.target.value)}
                        className="h-9 rounded-lg border border-sand-200 bg-white px-2 text-xs text-ink-700 outline-none focus:border-petroleum-500 sm:ml-auto"
                        aria-label={`Ändra status för avi ${notice.period || notice.id}`}
                      >
                        {Object.entries(labels).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>
    </section>
  </div>;
}
