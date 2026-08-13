"use client";

import { readResponseJson } from "@/lib/fetch-json";
import { useCallback, useEffect, useState } from "react";
import { Building2, Mail, Phone, RefreshCw, Search, UserRound } from "lucide-react";
import { EmptyState, InlineAlert, Panel, premiumFieldClass, premiumPrimaryButtonClass } from "@/components/dashboard/premium-ui";

type Lease = {
  id: string;
  lease_number: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  property: { id: string; name: string };
  unit: { id: string; designation: string; unit_type: string };
};

type Holder = {
  id: string;
  party_type: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  organization_number: string | null;
  status: string;
  leases: Lease[];
  _count: { leases: number };
};
type Pagination = { page: number; pageSize: number; total: number; totalPages: number };

type FormState = {
  partyType: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  organizationNumber: string;
  status: string;
};

const emptyForm: FormState = {
  partyType: "individual",
  name: "",
  contactName: "",
  email: "",
  phone: "",
  organizationNumber: "",
  status: "active",
};

export function PropertyResidentRegister({ propertyId }: { propertyId: string }) {
  const [holders, setHolders] = useState<Holder[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 25, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [canManage, setCanManage] = useState(false);

  const load = useCallback(async (requestedPage: number, requestedSearch: string) => {
    setLoading(true);
    setError("");
    try {
      const searchParams = new URLSearchParams({ propertyId, page: String(requestedPage), pageSize: "25" });
      if (requestedSearch) searchParams.set("search", requestedSearch);
      const response = await fetch(`/api/lease-holders?${searchParams.toString()}`, { cache: "no-store" });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte hämta boenderegistret");
      setHolders(data.holders || []);
      setCanManage(Boolean(data.permissions?.canManage));
      setPagination(data.pagination || { page: requestedPage, pageSize: 25, total: 0, totalPages: 1 });
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte hämta boenderegistret");
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setDebouncedQuery(query.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    void load(page, debouncedQuery);
  }, [debouncedQuery, load, page]);

  function startEdit(holder: Holder) {
    setEditingId(holder.id);
    setForm({
      partyType: holder.party_type,
      name: holder.name,
      contactName: holder.contact_name || "",
      email: holder.email || "",
      phone: holder.phone || "",
      organizationNumber: holder.organization_number || "",
      status: holder.status,
    });
    setMessage("");
    setError("");
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canManage) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(editingId ? `/api/lease-holders/${editingId}` : "/api/lease-holders", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte spara kontakten");
      setMessage(editingId ? "Kontakten har uppdaterats." : "Kontakten har lagts till i registret.");
      resetForm();
      if (page === 1) await load(1, debouncedQuery);
      else setPage(1);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte spara kontakten");
    } finally {
      setBusy(false);
    }
  }

  async function remove(holder: Holder) {
    if (!canManage || !window.confirm(`Ta bort ${holder.name} från kontaktregistret? Kontakten döljs från listor men behålls i historiken.`)) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/lease-holders/${holder.id}`, { method: "DELETE" });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte ta bort kontakten");
      setMessage("Kontakten har tagits bort.");
      if (editingId === holder.id) resetForm();
      const nextPage = holders.length === 1 && page > 1 ? page - 1 : page;
      if (nextPage === page) await load(page, debouncedQuery);
      else setPage(nextPage);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte ta bort kontakten");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-petroleum-600">Boende och kontakter</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-ink-950">Kontaktregister</h2>
          <p className="mt-1 text-sm text-ink-500">Hyresparter och boendekontakter med koppling till fastighetens avtal och objekt.</p>
        </div>
        <button type="button" onClick={() => void load(page, debouncedQuery)} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm font-semibold text-ink-700 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Uppdatera
        </button>
      </div>

      {error ? <InlineAlert>{error}</InlineAlert> : null}
      {message ? <InlineAlert tone="success">{message}</InlineAlert> : null}

      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <Panel title={editingId ? "Redigera kontakt" : "Ny kontakt"} description="Registrera privatperson eller organisation i kontaktregistret.">
          {canManage ? (
            <form onSubmit={submit} className="space-y-4">
              <Field label="Typ">
                <select className={premiumFieldClass} value={form.partyType} onChange={(event) => setForm({ ...form, partyType: event.target.value })}>
                  <option value="individual">Privatperson</option>
                  <option value="organization">Organisation</option>
                </select>
              </Field>
              <Field label={form.partyType === "organization" ? "Företagsnamn" : "Namn"}>
                <input required minLength={2} className={premiumFieldClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
              </Field>
              {form.partyType === "organization" ? (
                <>
                  <Field label="Kontaktperson"><input className={premiumFieldClass} value={form.contactName} onChange={(event) => setForm({ ...form, contactName: event.target.value })} /></Field>
                  <Field label="Organisationsnummer"><input required className={premiumFieldClass} value={form.organizationNumber} onChange={(event) => setForm({ ...form, organizationNumber: event.target.value })} /></Field>
                </>
              ) : null}
              <Field label="E-post"><input type="email" className={premiumFieldClass} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></Field>
              <Field label="Telefon"><input className={premiumFieldClass} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field>
              <Field label="Status">
                <select className={premiumFieldClass} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                  <option value="active">Aktiv</option>
                  <option value="inactive">Inaktiv</option>
                </select>
              </Field>
              <div className="flex gap-2">
                <button disabled={busy} className={`${premiumPrimaryButtonClass} flex-1`}>{busy ? "Sparar…" : editingId ? "Spara ändringar" : "Lägg till kontakt"}</button>
                {editingId ? <button type="button" onClick={resetForm} className="rounded-lg border border-sand-200 px-3 py-2 text-sm font-semibold text-ink-600">Avbryt</button> : null}
              </div>
            </form>
          ) : <p className="text-sm text-ink-500">Du har läsbehörighet till registret men saknar rättighet att ändra kontakter.</p>}
        </Panel>

        <Panel title="Boende och avtalsparter" description={`${pagination.total} registrerade kontakter på fastigheten`} bodyClassName="p-0">
          <div className="border-b border-sand-100 p-4">
            <label className="relative block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
              <input className={`${premiumFieldClass} pl-9`} maxLength={160} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Sök namn, e-post, telefon eller organisationsnummer" />
            </label>
          </div>
          {loading ? <div className="space-y-3 p-5">{[1, 2, 3].map((item) => <div key={item} className="h-28 animate-pulse rounded-xl bg-sand-100" />)}</div> : holders.length === 0 ? <EmptyState title="Inga kontakter hittades" description={debouncedQuery ? "Ingen kontakt matchar sökningen." : "Kontakter visas här när de kopplas till avtal på fastigheten."} /> : (
            <><div className="divide-y divide-sand-100">
              {holders.map((holder) => (
                <article key={holder.id} className="p-5 sm:p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="rounded-lg bg-sand-50 p-2 text-petroleum-700">{holder.party_type === "organization" ? <Building2 className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}</div>
                        <h3 className="font-semibold text-ink-950">{holder.name}</h3>
                        <span className="rounded-full border border-sand-200 bg-sand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-500">{holder.status === "active" ? "Aktiv" : "Inaktiv"}</span>
                      </div>
                      {holder.contact_name ? <p className="mt-2 text-sm text-ink-500">Kontaktperson: {holder.contact_name}</p> : null}
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-ink-600">
                        {holder.email ? <span className="inline-flex items-center gap-1.5"><Mail className="h-4 w-4 text-petroleum-600" />{holder.email}</span> : null}
                        {holder.phone ? <span className="inline-flex items-center gap-1.5"><Phone className="h-4 w-4 text-petroleum-600" />{holder.phone}</span> : null}
                      </div>
                    </div>
                    {canManage ? <div className="flex shrink-0 gap-2"><button type="button" onClick={() => startEdit(holder)} className="rounded-lg border border-sand-200 px-3 py-2 text-xs font-semibold text-ink-700">Redigera</button><button type="button" onClick={() => void remove(holder)} disabled={busy} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50">Ta bort</button></div> : null}
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {holder.leases.map((lease) => <div key={lease.id} className="rounded-xl border border-sand-100 bg-sand-50/70 px-3 py-2.5 text-sm"><p className="font-semibold text-ink-800">{lease.unit.designation}</p><p className="mt-1 text-xs text-ink-500">Avtal {lease.lease_number} · {lease.status}</p></div>)}
                  </div>
                </article>
              ))}
            </div><nav className="flex flex-col gap-3 border-t border-sand-100 px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between" aria-label="Kontaktpaginering"><p className="text-ink-500">Sida {pagination.page} av {pagination.totalPages} · {pagination.total} kontakter</p><div className="flex gap-2"><button type="button" disabled={loading || page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="h-10 rounded-xl border border-sand-200 bg-white px-4 font-semibold text-ink-700 transition hover:bg-sand-50 disabled:cursor-not-allowed disabled:opacity-50">Föregående</button><button type="button" disabled={loading || page >= pagination.totalPages} onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))} className="h-10 rounded-xl border border-sand-200 bg-white px-4 font-semibold text-ink-700 transition hover:bg-sand-50 disabled:cursor-not-allowed disabled:opacity-50">Nästa</button></div></nav></>
          )}
        </Panel>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-medium text-ink-700">{label}</span>{children}</label>;
}
