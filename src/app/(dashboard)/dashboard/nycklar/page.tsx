"use client";

import { useEffect, useMemo, useState } from "react";
import { KeyRound, ShieldCheck, TriangleAlert, Undo2 } from "lucide-react";
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

const typeLabels: Record<string, string> = {
  key: "Nyckel",
  tag: "Tagg",
  card: "Passerkort",
  code: "Kod",
  remote: "Fjärrkontroll",
};
const statusLabels: Record<string, string> = {
  in_stock: "I förråd",
  issued: "Utlämnad",
  returned: "Återlämnad",
  blocked: "Spärrad",
  lost: "Förlorad",
};

const emptyForm = {
  propertyId: "",
  identifier: "",
  credentialType: "key",
  holder: "",
  unit: "",
  accessArea: "",
  status: "in_stock",
  issuedAt: "",
  returnDue: "",
  note: "",
};

export default function KeysPage() {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editForm, setEditForm] = useState({
    identifier: "",
    credentialType: "key",
    holder: "",
    unit: "",
    accessArea: "",
    issuedAt: "",
    returnDue: "",
    note: "",
  });

  async function load() {
    setLoading(true);
    const response = await fetch("/api/access-credentials", { cache: "no-store" });
    const data = await readResponseJson<{
      credentials?: Credential[];
      properties?: Property[];
      error?: string;
    }>(response);
    if (response.ok) {
      setCredentials(data.credentials || []);
      setProperties(data.properties || []);
    } else setError(data.error || "Kunde inte hämta nyckelregistret");
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const summary = useMemo(
    () => ({
      total: credentials.length,
      issued: credentials.filter((item) => item.status === "issued").length,
      blocked: credentials.filter((item) => item.status === "blocked" || item.status === "lost").length,
      overdue: credentials.filter(
        (item) => item.status === "issued" && item.return_due && new Date(item.return_due) < new Date(),
      ).length,
    }),
    [credentials],
  );

  const filtered = useMemo(() => {
    const needle = query.toLowerCase().trim();
    if (!needle) return credentials;
    return credentials.filter((item) =>
      [item.identifier, item.holder, item.unit, item.property_name, item.access_area].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(needle),
      ),
    );
  }, [credentials, query]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const response = await fetch("/api/access-credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await readResponseJson<{ error?: string }>(response);
    if (!response.ok) setError(data.error || "Kunde inte spara posten");
    else {
      setForm(emptyForm);
      await load();
    }
    setSaving(false);
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
  }

  async function saveEdit(credential: Credential) {
    if (credential.source === "legacy") {
      setError("Posten finns i äldre lagring. Kör backfill till AccessCredential innan den kan ändras.");
      return;
    }
    setUpdatingId(credential.id);
    setError("");
    const response = await fetch("/api/access-credentials", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credentialId: credential.id, ...editForm }),
    });
    const data = await readResponseJson<{ error?: string }>(response);
    if (!response.ok) setError(data.error || "Kunde inte uppdatera posten");
    else {
      setEditingId("");
      await load();
    }
    setUpdatingId("");
  }

  async function updateStatus(credential: Credential, status: string) {
    if (credential.source === "legacy") {
      setError("Posten finns i äldre lagring. Kör backfill till AccessCredential innan status ändras.");
      return;
    }
    setUpdatingId(credential.id);
    setError("");
    const response = await fetch("/api/access-credentials", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credentialId: credential.id, status }),
    });
    const data = await readResponseJson<{ error?: string }>(response);
    if (!response.ok) setError(data.error || "Kunde inte uppdatera status");
    else await load();
    setUpdatingId("");
  }

  const field =
    "h-11 w-full rounded-lg border border-sand-200 bg-white px-3 text-sm text-ink-800 outline-none transition focus:border-petroleum-500";

  return (
    <div className="space-y-8">
      <header>
        <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-ink-400">Säkerhet och åtkomst</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.04em] text-ink-900">Nycklar och passage</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-500">
          Samla nycklar, taggar, passerkort och utlämningar i ett spårbart register per fastighet.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(
          [
            [KeyRound, "Totalt registrerade", summary.total],
            [ShieldCheck, "Utlämnade", summary.issued],
            [TriangleAlert, "Spärrade eller förlorade", summary.blocked],
            [Undo2, "Försenad återlämning", summary.overdue],
          ] as const
        ).map(([Icon, label, value]) => (
          <div
            key={label}
            className="rounded-2xl border border-sand-200 bg-white p-5 shadow-[0_1px_2px_rgba(17,34,31,0.04)]"
          >
            <Icon className="h-5 w-5 text-petroleum-700" strokeWidth={1.6} />
            <p className="mt-5 text-xs font-medium text-ink-500">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-ink-900">{value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[390px_1fr]">
        <form
          onSubmit={submit}
          className="rounded-2xl border border-sand-200 bg-white p-6 shadow-[0_1px_2px_rgba(17,34,31,0.04)]"
        >
          <h2 className="font-display text-xl font-semibold text-ink-900">Registrera behörighet</h2>
          <p className="mt-1 text-sm text-ink-500">Dokumentera lager, utlämning och spärrning.</p>
          <div className="mt-6 space-y-4">
            <select
              className={field}
              value={form.propertyId}
              onChange={(e) => setForm({ ...form, propertyId: e.target.value })}
              required
            >
              <option value="">Välj fastighet</option>
              {properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <input
                className={field}
                placeholder="Nyckel-/taggnummer"
                value={form.identifier}
                onChange={(e) => setForm({ ...form, identifier: e.target.value })}
                required
              />
              <select
                className={field}
                value={form.credentialType}
                onChange={(e) => setForm({ ...form, credentialType: e.target.value })}
              >
                {Object.entries(typeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <select
              className={field}
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <input
              className={field}
              placeholder="Mottagare eller innehavare"
              value={form.holder}
              onChange={(e) => setForm({ ...form, holder: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                className={field}
                placeholder="Lägenhet/lokal"
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
              />
              <input
                className={field}
                placeholder="Behörighetsområde"
                value={form.accessArea}
                onChange={(e) => setForm({ ...form, accessArea: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-ink-500">
                Utlämnad
                <input
                  className={`${field} mt-1`}
                  type="date"
                  value={form.issuedAt}
                  onChange={(e) => setForm({ ...form, issuedAt: e.target.value })}
                />
              </label>
              <label className="text-xs text-ink-500">
                Åter senast
                <input
                  className={`${field} mt-1`}
                  type="date"
                  value={form.returnDue}
                  onChange={(e) => setForm({ ...form, returnDue: e.target.value })}
                />
              </label>
            </div>
            <textarea
              className="min-h-24 w-full rounded-lg border border-sand-200 bg-white px-3 py-3 text-sm outline-none focus:border-petroleum-500"
              placeholder="Anteckning eller kvittensreferens"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
            {error ? <p className="text-sm text-red-700">{error}</p> : null}
            <button
              disabled={saving}
              className="h-11 w-full rounded-lg bg-petroleum-700 text-sm font-semibold text-white hover:bg-petroleum-800 disabled:opacity-60"
            >
              {saving ? "Sparar…" : "Spara i registret"}
            </button>
          </div>
        </form>

        <div className="rounded-2xl border border-sand-200 bg-white shadow-[0_1px_2px_rgba(17,34,31,0.04)]">
          <div className="flex flex-col gap-4 border-b border-sand-200 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-xl font-semibold text-ink-900">Nyckelregister</h2>
              <p className="mt-1 text-sm text-ink-500">Spårbar översikt över samtliga behörigheter.</p>
            </div>
            <input
              className="h-10 rounded-lg border border-sand-200 px-3 text-sm outline-none focus:border-petroleum-500"
              placeholder="Sök nummer, mottagare eller fastighet"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="divide-y divide-sand-200">
            {loading ? (
              <p className="p-6 text-sm text-ink-500">Hämtar register…</p>
            ) : filtered.length === 0 ? (
              <p className="p-10 text-center text-sm text-ink-500">Inga poster hittades.</p>
            ) : (
              filtered.map((item) => (
                <article key={item.id} className="space-y-3 p-6">
                  <div className="flex flex-col justify-between gap-4 sm:flex-row">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-ink-900">{item.identifier}</h3>
                        <span className="rounded-full bg-sand-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-ink-600">
                          {typeLabels[item.credential_type || "key"]}
                        </span>
                        <span className="rounded-full border border-sand-200 px-2.5 py-1 text-[10px] font-semibold text-ink-600">
                          {statusLabels[item.status || "in_stock"]}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-ink-500">
                        {item.property_name}
                        {item.unit ? ` · ${item.unit}` : ""}
                        {item.access_area ? ` · ${item.access_area}` : ""}
                      </p>
                      {item.source === "legacy" ? (
                        <p className="mt-2 text-xs font-medium text-amber-800">
                          Äldre rad – kör backfill innan behörigheten kan ändras.
                        </p>
                      ) : null}
                    </div>
                    <div className="space-y-2 sm:text-right">
                      <p className="text-sm font-semibold text-ink-800">{item.holder || "Ingen mottagare"}</p>
                      <p className="text-xs text-ink-400">
                        {item.return_due
                          ? `Åter senast ${new Date(item.return_due).toLocaleDateString("sv-SE")}`
                          : "Ingen återlämningsdag"}
                      </p>
                      {item.source !== "legacy" ? (
                        <div className="flex flex-wrap gap-2 sm:justify-end">
                          <button
                            type="button"
                            className="h-9 rounded-lg border border-sand-200 px-3 text-xs font-semibold text-ink-700 hover:bg-sand-50"
                            onClick={() => (editingId === item.id ? setEditingId("") : startEdit(item))}
                          >
                            {editingId === item.id ? "Stäng" : "Ändra"}
                          </button>
                          <select
                            className="h-9 rounded-lg border border-sand-200 bg-white px-2 text-xs text-ink-700"
                            defaultValue=""
                            disabled={updatingId === item.id}
                            onChange={(event) => {
                              const value = event.target.value;
                              if (value) void updateStatus(item, value);
                              event.target.value = "";
                            }}
                          >
                            <option value="" disabled>
                              Ändra status
                            </option>
                            {Object.entries(statusLabels)
                              .filter(([value]) => value !== item.status)
                              .map(([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ))}
                          </select>
                        </div>
                      ) : (
                        <p className="text-xs text-amber-700">Kräver backfill</p>
                      )}
                    </div>
                  </div>
                  {editingId === item.id ? (
                    <div className="grid gap-3 rounded-xl border border-sand-200 bg-sand-50/60 p-4 sm:grid-cols-2">
                      <input
                        className={field}
                        value={editForm.identifier}
                        onChange={(e) => setEditForm({ ...editForm, identifier: e.target.value })}
                        placeholder="Identitet"
                      />
                      <select
                        className={field}
                        value={editForm.credentialType}
                        onChange={(e) => setEditForm({ ...editForm, credentialType: e.target.value })}
                      >
                        {Object.entries(typeLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <input
                        className={field}
                        value={editForm.holder}
                        onChange={(e) => setEditForm({ ...editForm, holder: e.target.value })}
                        placeholder="Mottagare"
                      />
                      <input
                        className={field}
                        value={editForm.unit}
                        onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}
                        placeholder="Lägenhet/lokal"
                      />
                      <input
                        className={field}
                        value={editForm.accessArea}
                        onChange={(e) => setEditForm({ ...editForm, accessArea: e.target.value })}
                        placeholder="Behörighetsområde"
                      />
                      <input
                        className={field}
                        type="date"
                        value={editForm.issuedAt}
                        onChange={(e) => setEditForm({ ...editForm, issuedAt: e.target.value })}
                      />
                      <input
                        className={field}
                        type="date"
                        value={editForm.returnDue}
                        onChange={(e) => setEditForm({ ...editForm, returnDue: e.target.value })}
                      />
                      <textarea
                        className="min-h-20 w-full rounded-lg border border-sand-200 bg-white px-3 py-3 text-sm outline-none focus:border-petroleum-500 sm:col-span-2"
                        value={editForm.note}
                        onChange={(e) => setEditForm({ ...editForm, note: e.target.value })}
                        placeholder="Anteckning"
                      />
                      <button
                        type="button"
                        disabled={updatingId === item.id}
                        onClick={() => void saveEdit(item)}
                        className="h-10 rounded-lg bg-petroleum-700 text-sm font-semibold text-white hover:bg-petroleum-800 disabled:opacity-60 sm:col-span-2"
                      >
                        {updatingId === item.id ? "Sparar…" : "Spara ändringar"}
                      </button>
                    </div>
                  ) : null}
                </article>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
