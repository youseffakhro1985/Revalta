"use client";

import { useEffect, useMemo, useState } from "react";
import { CreditCard, Gauge, RadioTower } from "lucide-react";
import {
  EmptyState,
  InlineAlert,
  MetricCard,
  PageHeader,
  Panel,
  premiumFieldClass,
  premiumPrimaryButtonClass,
} from "@/components/dashboard/premium-ui";

type Property = { id: string; name: string; address?: string; city?: string };
type Lease = { id: string; property_id: string; lease_number: string; unit: string; tenant_name: string };
type Debit = { id: string; status: string; rent_notice_id: string | null; lease_id: string | null; charge: number };
type Reading = {
  id: string;
  property_id?: string;
  property_name?: string;
  unit?: string;
  meter_id?: string;
  meter_type?: string;
  period?: string;
  consumption?: number;
  unit_price?: number;
  charge?: number;
  debit?: Debit | null;
  source?: string;
};

const labels: Record<string, string> = { electricity: "El", hot_water: "Varmvatten", cold_water: "Kallvatten", heating: "Värme" };
const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 2 });

export default function ImdPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [leases, setLeases] = useState<Lease[]>([]);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [leaseId, setLeaseId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [linkingId, setLinkingId] = useState("");
  const [voidingId, setVoidingId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/imd-readings", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunde inte hämta mätvärden");
      setProperties(data.properties || []);
      setLeases(data.leases || []);
      setReadings(data.readings || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte hämta mätvärden");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const availableLeases = useMemo(
    () => leases.filter((lease) => !propertyId || lease.property_id === propertyId),
    [leases, propertyId],
  );

  async function submit(formData: FormData) {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = Object.fromEntries(formData.entries());
      const response = await fetch("/api/imd-readings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, propertyId, leaseId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunde inte spara avläsningen");
      setSuccess("Avläsningen har sparats och en öppen debiteringsrad skapades.");
      setLeaseId("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte spara avläsningen");
    } finally {
      setSaving(false);
    }
  }

  async function attachNotice(reading: Reading) {
    if (!reading.debit || reading.debit.status === "linked") return;
    if (!window.confirm("Skapa en utkast-hyresavi och koppla IMD-debiteringen?")) return;
    setLinkingId(reading.id);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/imd-readings/${reading.id}/attach-notice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          createNotice: true,
          leaseId: reading.debit.lease_id || leaseId || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunde inte koppla debitering");
      setSuccess("Debiteringen är kopplad till hyresavi.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte koppla debitering");
    } finally {
      setLinkingId("");
    }
  }

  async function voidReading(reading: Reading) {
    if (reading.source === "legacy") {
      setError("Avläsningen finns i äldre lagring. Kör backfill till ImdReading innan den kan makuleras.");
      return;
    }
    if (reading.debit?.rent_notice_id) {
      setError("Avläsningen är kopplad till en hyresavi och kan inte makuleras.");
      return;
    }
    if (!window.confirm("Makulera den här avläsningen? Den döljs från listan men behålls i historiken.")) return;
    setVoidingId(reading.id);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/imd-readings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ readingId: reading.id, action: "void" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunde inte makulera avläsningen");
      setSuccess("Avläsningen har makulerats.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte makulera avläsningen");
    } finally {
      setVoidingId("");
    }
  }

  const totals = useMemo(() => ({
    charge: readings.reduce((sum, item) => sum + Number(item.charge || 0), 0),
    consumption: readings.reduce((sum, item) => sum + Number(item.consumption || 0), 0),
    meters: new Set(readings.map((item) => item.meter_id).filter(Boolean)).size,
    openDebits: readings.filter((item) => item.debit?.status === "open").length,
  }), [readings]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Förbrukning och debitering"
        title="Mätare och IMD"
        description="Individuell mätning och debitering för el, varmvatten, kallvatten och värme per lägenhet eller lokal."
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={RadioTower} label="Registrerade mätare" value={totals.meters.toLocaleString("sv-SE")} />
        <MetricCard icon={Gauge} label="Samlad förbrukning" value={number.format(totals.consumption)} />
        <MetricCard icon={CreditCard} label="Debiteringsunderlag" value={money.format(totals.charge)} />
        <MetricCard icon={CreditCard} label="Öppna debiteringar" value={totals.openDebits.toLocaleString("sv-SE")} />
      </section>

      <Panel title="Registrera avläsning" description="Förbrukning, debiteringsbelopp och öppen debiteringsrad skapas automatiskt.">
        <form action={submit} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <select
              required
              value={propertyId}
              onChange={(event) => { setPropertyId(event.target.value); setLeaseId(""); }}
              className={premiumFieldClass}
            >
              <option value="">Välj fastighet</option>
              {properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
            </select>
            <select value={leaseId} onChange={(event) => setLeaseId(event.target.value)} className={premiumFieldClass}>
              <option value="">Valfritt hyresavtal</option>
              {availableLeases.map((lease) => (
                <option key={lease.id} value={lease.id}>
                  {lease.lease_number} · {lease.unit} · {lease.tenant_name}
                </option>
              ))}
            </select>
            <input name="unit" required placeholder="Lägenhet eller lokal" className={premiumFieldClass} />
            <input name="meterId" required placeholder="Mätar-ID" className={premiumFieldClass} />
            <select name="type" className={premiumFieldClass}>
              {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <input name="period" required type="month" className={premiumFieldClass} />
            <input name="previousReading" required type="number" min="0" step="0.001" placeholder="Föregående avläsning" className={premiumFieldClass} />
            <input name="currentReading" required type="number" min="0" step="0.001" placeholder="Aktuell avläsning" className={premiumFieldClass} />
            <input name="unitPrice" required type="number" min="0" step="0.01" placeholder="Pris per enhet" className={premiumFieldClass} />
            <input name="note" placeholder="Anteckning" className={`${premiumFieldClass} md:col-span-2 xl:col-span-2`} />
            <button disabled={saving} className={premiumPrimaryButtonClass}>{saving ? "Sparar…" : "Spara avläsning"}</button>
          </div>
          {error ? <InlineAlert>{error}</InlineAlert> : null}
          {success ? <InlineAlert tone="success">{success}</InlineAlert> : null}
        </form>
      </Panel>

      <Panel title="Avläsningar och debitering" description="Samlad historik med förbrukning, pris, debiteringsbelopp och koppling till hyresavi." bodyClassName="p-0">
        {loading ? (
          <div className="p-6 text-sm text-ink-500">Hämtar mätvärden…</div>
        ) : readings.length === 0 ? (
          <EmptyState title="Inga avläsningar registrerade" description="När en mätaravläsning sparas visas den här tillsammans med debiteringsunderlaget." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-sand-50 text-xs uppercase tracking-[0.08em] text-ink-400">
                <tr>
                  {["Fastighet", "Objekt", "Mätare", "Typ", "Period", "Förbrukning", "Belopp", "Debitering", ""].map((head) => (
                    <th key={head || "actions"} className="px-5 py-3 font-semibold">{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-100">
                {readings.map((item) => {
                  const canVoid = item.source === "table" && !item.debit?.rent_notice_id;
                  return (
                  <tr key={item.id} className="text-ink-700 transition-colors hover:bg-sand-50/60">
                    <td className="px-5 py-4 font-medium text-ink-900">{item.property_name}</td>
                    <td className="px-5 py-4">{item.unit}</td>
                    <td className="px-5 py-4">{item.meter_id}</td>
                    <td className="px-5 py-4">{labels[item.meter_type || ""] || item.meter_type}</td>
                    <td className="px-5 py-4">{item.period}</td>
                    <td className="px-5 py-4">{number.format(Number(item.consumption || 0))}</td>
                    <td className="px-5 py-4 font-semibold text-ink-900">{money.format(Number(item.charge || 0))}</td>
                    <td className="px-5 py-4">
                      {item.debit?.status === "linked" ? (
                        <span className="text-xs font-semibold text-emerald-800">Kopplad till avi</span>
                      ) : item.debit?.status === "open" && item.source === "table" ? (
                        <button
                          type="button"
                          disabled={linkingId === item.id}
                          onClick={() => void attachNotice(item)}
                          className="rounded-lg border border-petroleum-200 px-3 py-1.5 text-xs font-semibold text-petroleum-800 hover:bg-petroleum-50"
                        >
                          {linkingId === item.id ? "Kopplar…" : "Skapa avi"}
                        </button>
                      ) : item.source === "legacy" ? (
                        <span className="text-xs font-medium text-amber-800">Äldre rad – kör backfill innan makulering</span>
                      ) : (
                        <span className="text-xs text-ink-400">Saknas</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {canVoid ? (
                        <button
                          type="button"
                          disabled={voidingId === item.id}
                          onClick={() => void voidReading(item)}
                          className="text-xs font-semibold text-red-700 transition hover:text-red-900 disabled:opacity-60"
                        >
                          {voidingId === item.id ? "Makulerar…" : "Makulera"}
                        </button>
                      ) : item.source === "legacy" ? (
                        <span className="text-xs text-ink-400">—</span>
                      ) : null}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
