"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, KeyRound, Search, ShieldCheck, TriangleAlert, Undo2 } from "lucide-react";
import {
  EmptyState,
  InlineAlert,
  LoadingState,
  MetricCard,
  PageHeader,
  Panel,
  StatusBadge,
  premiumCompactButtonClass,
  premiumFieldClass,
  premiumPrimaryButtonClass,
  premiumSecondaryButtonClass,
  premiumTextareaClass,
} from "@/components/dashboard/premium-ui";
import { readResponseJson } from "@/lib/fetch-json";

type Property = { id: string; name: string; address: string; city: string };
type Credential = {
  id: string;
  property_id?: string;
  property_name?: string;
  identifier?: string;
  credential_type?: string;
  holder?: string;
  unit?: string;
  access_area?: string;
  status?: string;
  issued_at?: string | null;
  return_due?: string | null;
  note?: string;
  registered_by?: string;
  created_at: string;
  source?: "table" | "legacy";
};

const typeLabels: Record<string, string> = { key: "Nyckel", tag: "Tagg", card: "Passerkort", code: "Kod", remote: "Fjärrkontroll" };
const statusLabels: Record<string, string> = { in_stock: "I förråd", issued: "Utlämnad", returned: "Återlämnad", blocked: "Spärrad", lost: "Förlorad" };
const emptyForm = { propertyId: "", identifier: "", credentialType: "key", holder: "", unit: "", accessArea: "", status: "in_stock", issuedAt: "", returnDue: "", note: "" };
const date = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" });

function statusTone(status?: string): "neutral" | "info" | "success" | "warning" | "danger" {
  if (status === "issued") return "info";
  if (status === "returned" || status === "in_stock") return "success";
  if (status === "blocked" || status === "lost") return "danger";
  return "neutral";
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export default function KeysPage() {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [query, setQuery] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editForm, setEditForm] = useState({ identifier: "", credentialType: "key", holder: "", unit: "", accessArea: "", issuedAt: "", returnDue: "", note: "" });

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/access-credentials", { cache: "no-store" });
      const data = await readResponseJson<{ credentials?: Credential[]; properties?: Property[]; error?: string }>(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte hämta nyckelregistret");
      setCredentials(data.credentials || []);
      setProperties(data.properties || []);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte hämta nyckelregistret");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const summary = useMemo(() => ({
    total: credentials.length,
    issued: credentials.filter((item) => item.status === "issued").length,
    blocked: credentials.filter((item) => item.status === "blocked" || item.status === "lost").length,
    overdue: credentials.filter((item) => item.status === "issued" && item.return_due && new Date(item.return_due).getTime() < Date.now()).length,
  }), [credentials]);

  const filtered = useMemo(() => {
    const needle = query.toLowerCase().trim();
    return credentials.filter((item) => {
      if (propertyFilter && item.property_id !== propertyFilter) return false;
      if (statusFilter && item.status !== statusFilter) return false;
      if (!needle) return true;
      return [item.identifier, item.holder, item.unit, item.property_name, item.access_area, item.registered_by].some((value) => String(value || "").toLowerCase().includes(needle));
    });
  }, [credentials, propertyFilter, query, statusFilter]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/access-credentials", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await readResponseJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte spara posten");
      setForm(emptyForm);
      setSuccess("Behörigheten har registrerats.");
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte spara posten");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(credential: Credential) {
    if (credential.source === "legacy") {
      setError("Posten finns i äldre lagring. Kör backfill till AccessCredential innan den kan ändras.");
      return;
    }
    setEditingId(credential.id);
    setEditForm({
      identifier: credential.identifier || "",
      credentialType: credential.credential_type || "key",
      holder: credential.holder || "",
      unit: credential.unit || "",
      accessArea: credential.access_area || "",
      issuedAt: credential.issued_at || "",
      returnDue: credential.return_due || "",
      note: credential.note || "",
    });
    setError("");
    setSuccess("");
  }

  async function saveEdit(credential: Credential) {
    if (credential.source === "legacy") {
      setError("Posten finns i äldre lagring. Kör backfill till AccessCredential innan den kan ändras.");
      return;
    }
    setUpdatingId(credential.id);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/access-credentials", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credentialId: credential.id, ...editForm }) });
      const data = await readResponseJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte uppdatera posten");
      setEditingId("");
      setSuccess("Behörigheten har uppdaterats.");
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte uppdatera posten");
    } finally {
      setUpdatingId("");
    }
  }

  async function updateStatus(credential: Credential, status: string) {
    if (credential.source === "legacy") {
      setError("Posten finns i äldre lagring. Kör backfill till AccessCredential innan status ändras.");
      return;
    }
    setUpdatingId(credential.id);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/access-credentials", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credentialId: credential.id, status }) });
      const data = await readResponseJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte uppdatera status");
      setSuccess(`Status ändrad till ${statusLabels[status] || status}.`);
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte uppdatera status");
    } finally {
      setUpdatingId("");
    }
  }

  function exportCsv() {
    const rows = [
      ["Fastighet", "Identitet", "Typ", "Status", "Mottagare", "Objekt", "Behörighetsområde", "Utlämnad", "Åter senast", "Registrerad av"],
      ...filtered.map((item) => [item.property_name, item.identifier, typeLabels[item.credential_type || "key"], statusLabels[item.status || "in_stock"], item.holder, item.unit, item.access_area, item.issued_at, item.return_due, item.registered_by]),
    ];
    const blob = new Blob(["\uFEFF" + rows.map((row) => row.map(csvCell).join(";")).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `revalta-nyckelregister-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Säkerhet och åtkomst" title="Nycklar och passage" description="Samla nycklar, taggar, passerkort och utlämningar i ett spårbart register per fastighet." action={<button type="button" onClick={exportCsv} disabled={!filtered.length} className={`${premiumSecondaryButtonClass} w-full gap-2 sm:w-auto`}><Download className="h-4 w-4" aria-hidden="true" />Exportera CSV</button>} />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={KeyRound} label="Totalt registrerade" value={summary.total} hint="Samtliga aktiva registerposter" />
        <MetricCard icon={ShieldCheck} label="Utlämnade" value={summary.issued} hint="Behörigheter ute hos mottagare" />
        <MetricCard icon={TriangleAlert} label="Spärrade eller förlorade" value={summary.blocked} hint="Kräver säkerhetsuppföljning" />
        <MetricCard icon={Undo2} label="Försenad återlämning" value={summary.overdue} hint="Passerat återlämningsdatum" />
      </section>

      {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
      {success ? <InlineAlert tone="success">{success}</InlineAlert> : null}

      <section className="grid gap-6 xl:grid-cols-[390px_1fr]">
        <Panel title="Registrera behörighet" description="Dokumentera lager, utlämning, återlämning och spärrning." className="h-fit xl:sticky xl:top-[112px]">
          <form onSubmit={submit} className="space-y-4">
            <select className={premiumFieldClass} value={form.propertyId} onChange={(event) => setForm({ ...form, propertyId: event.target.value })} required aria-label="Välj fastighet"><option value="">Välj fastighet</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select>
            <div className="grid grid-cols-2 gap-3"><input className={premiumFieldClass} placeholder="Nyckel-/taggnummer" value={form.identifier} onChange={(event) => setForm({ ...form, identifier: event.target.value })} required aria-label="Nyckel-/taggnummer" /><select className={premiumFieldClass} value={form.credentialType} onChange={(event) => setForm({ ...form, credentialType: event.target.value })} aria-label="Typ av behörighet">{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            <select className={premiumFieldClass} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} aria-label="Status">{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <input className={premiumFieldClass} placeholder="Mottagare eller innehavare" value={form.holder} onChange={(event) => setForm({ ...form, holder: event.target.value })} aria-label="Mottagare eller innehavare" />
            <div className="grid grid-cols-2 gap-3"><input className={premiumFieldClass} placeholder="Lägenhet/lokal" value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} aria-label="Lägenhet/lokal" /><input className={premiumFieldClass} placeholder="Behörighetsområde" value={form.accessArea} onChange={(event) => setForm({ ...form, accessArea: event.target.value })} aria-label="Behörighetsområde" /></div>
            <div className="grid grid-cols-2 gap-3"><label className="text-xs font-semibold text-ink-600">Utlämnad<input className={`${premiumFieldClass} mt-1.5`} type="date" value={form.issuedAt} onChange={(event) => setForm({ ...form, issuedAt: event.target.value })} /></label><label className="text-xs font-semibold text-ink-600">Åter senast<input className={`${premiumFieldClass} mt-1.5`} type="date" value={form.returnDue} onChange={(event) => setForm({ ...form, returnDue: event.target.value })} /></label></div>
            <textarea className={premiumTextareaClass} placeholder="Anteckning eller kvittensreferens" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} aria-label="Anteckning eller kvittensreferens" />
            <button disabled={saving} className={`${premiumPrimaryButtonClass} w-full`}>{saving ? "Sparar…" : "Spara i registret"}</button>
          </form>
        </Panel>

        <Panel title="Nyckelregister" description="Spårbar översikt över samtliga behörigheter och återlämningar." bodyClassName="p-0">
          <div className="grid gap-3 border-b border-sand-200 p-4 sm:grid-cols-[1fr_190px_170px] sm:p-5">
            <label className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" /><input className={`${premiumFieldClass} pl-9`} placeholder="Sök nummer, mottagare eller fastighet" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Sök nummer, mottagare eller fastighet" /></label>
            <select className={premiumFieldClass} value={propertyFilter} onChange={(event) => setPropertyFilter(event.target.value)} aria-label="Filtrera fastighet"><option value="">Alla fastigheter</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select>
            <select className={premiumFieldClass} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filtrera status"><option value="">Alla statusar</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          </div>

          {loading ? <LoadingState label="Hämtar nyckelregister…" rows={4} /> : filtered.length === 0 ? <EmptyState icon={KeyRound} title="Inga poster hittades" description={credentials.length ? "Justera sökning eller filter för att visa fler behörigheter." : "Registrera den första nyckeln, taggen eller passagebehörigheten."} /> : (
            <div className="divide-y divide-sand-100">
              {filtered.map((item) => (
                <article key={item.id} className="p-5 transition hover:bg-sand-50/60 sm:p-6">
                  <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-ink-900">{item.identifier}</h3><StatusBadge>{typeLabels[item.credential_type || "key"]}</StatusBadge><StatusBadge tone={statusTone(item.status)}>{statusLabels[item.status || "in_stock"]}</StatusBadge></div>
                      <p className="mt-2 text-sm text-ink-500">{item.property_name}{item.unit ? ` · ${item.unit}` : ""}{item.access_area ? ` · ${item.access_area}` : ""}</p>
                      {item.note ? <p className="mt-2 max-w-2xl text-xs leading-5 text-ink-500">{item.note}</p> : null}
                      {item.source === "legacy" ? <p className="mt-2 text-xs font-medium text-amber-800">Äldre rad – kör backfill innan behörigheten kan ändras.</p> : null}
                    </div>
                    <div className="min-w-[230px] space-y-3 lg:text-right">
                      <div><p className="text-sm font-semibold text-ink-800">{item.holder || "Ingen mottagare"}</p><p className="mt-1 text-xs text-ink-500">{item.return_due ? `Åter senast ${date.format(new Date(item.return_due))}` : "Ingen återlämningsdag"}</p>{item.registered_by ? <p className="mt-1 text-[11px] text-ink-400">Registrerad av {item.registered_by}</p> : null}</div>
                      {item.source !== "legacy" ? <div className="flex flex-wrap gap-2 lg:justify-end"><button type="button" className={premiumCompactButtonClass} onClick={() => (editingId === item.id ? setEditingId("") : startEdit(item))}>{editingId === item.id ? "Stäng" : "Ändra"}</button><select className="h-9 rounded-lg border border-sand-200 bg-white px-2 text-xs font-semibold text-ink-700 outline-none focus:border-petroleum-500 focus:ring-2 focus:ring-petroleum-100" defaultValue="" disabled={updatingId === item.id} onChange={(event) => { const value = event.target.value; if (value) void updateStatus(item, value); event.target.value = ""; }} aria-label={`Ändra status för ${item.identifier || "behörighet"}`}><option value="" disabled>Ändra status</option>{Object.entries(statusLabels).filter(([value]) => value !== item.status).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div> : <p className="text-xs text-amber-700">Kräver backfill</p>}
                    </div>
                  </div>

                  {editingId === item.id ? (
                    <div className="mt-5 rounded-xl border border-sand-200 bg-sand-50/65 p-4">
                      <div className="grid gap-3 sm:grid-cols-2"><input className={premiumFieldClass} value={editForm.identifier} onChange={(event) => setEditForm({ ...editForm, identifier: event.target.value })} placeholder="Identitet" aria-label="Identitet" /><select className={premiumFieldClass} value={editForm.credentialType} onChange={(event) => setEditForm({ ...editForm, credentialType: event.target.value })} aria-label="Typ av behörighet">{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input className={premiumFieldClass} value={editForm.holder} onChange={(event) => setEditForm({ ...editForm, holder: event.target.value })} placeholder="Mottagare" aria-label="Mottagare" /><input className={premiumFieldClass} value={editForm.unit} onChange={(event) => setEditForm({ ...editForm, unit: event.target.value })} placeholder="Lägenhet/lokal" aria-label="Lägenhet/lokal" /><input className={premiumFieldClass} value={editForm.accessArea} onChange={(event) => setEditForm({ ...editForm, accessArea: event.target.value })} placeholder="Behörighetsområde" aria-label="Behörighetsområde" /><input className={premiumFieldClass} type="date" value={editForm.issuedAt} onChange={(event) => setEditForm({ ...editForm, issuedAt: event.target.value })} aria-label="Utlämnad" /><input className={premiumFieldClass} type="date" value={editForm.returnDue} onChange={(event) => setEditForm({ ...editForm, returnDue: event.target.value })} aria-label="Åter senast" /><textarea className={`${premiumTextareaClass} sm:col-span-2`} value={editForm.note} onChange={(event) => setEditForm({ ...editForm, note: event.target.value })} placeholder="Anteckning" aria-label="Anteckning" /></div>
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row"><button type="button" disabled={updatingId === item.id} onClick={() => void saveEdit(item)} className={premiumPrimaryButtonClass}>{updatingId === item.id ? "Sparar…" : "Spara ändringar"}</button><button type="button" onClick={() => setEditingId("")} className={premiumSecondaryButtonClass}>Avbryt</button></div>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </Panel>
      </section>
    </div>
  );
}
