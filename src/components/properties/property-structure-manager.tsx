"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, DoorOpen, Pencil, Trash2, X } from "lucide-react";

const fieldClass = "mt-1 block w-full rounded-lg border border-sand-200 bg-white px-3 py-2.5 text-sm text-ink-900 outline-none transition focus:border-petroleum-500 focus:ring-2 focus:ring-petroleum-100";
const labelClass = "text-xs font-semibold uppercase tracking-[0.08em] text-ink-500";

type Building = {
  id: string;
  name: string;
  address: string | null;
  construction_year: number | null;
  floors: number | null;
  _count: { units: number };
};

type Unit = {
  id: string;
  designation: string;
  unit_type: string;
  status: string;
  building_id: string | null;
  floor: string | null;
  area: number | null;
  rooms: number | null;
  building: { id: string; name: string } | null;
};

type EditState =
  | { kind: "building"; id: string; values: { name: string; address: string; constructionYear: string; floors: string } }
  | { kind: "unit"; id: string; values: { designation: string; unitType: string; status: string; buildingId: string; floor: string; area: string; rooms: string } }
  | null;

async function requestJson(url: string, options: RequestInit) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Ändringen kunde inte genomföras");
  return data;
}

function unitTypeLabel(type: string) {
  return ({ apartment: "Lägenhet", commercial: "Lokal", storage: "Förråd", garage: "Garage", parking: "Parkering", technical: "Tekniskt utrymme", other: "Övrigt" } as Record<string, string>)[type] || type;
}

function statusLabel(status: string) {
  return ({ active: "Aktiv", vacant: "Vakant", maintenance: "Under åtgärd", inactive: "Inaktiv" } as Record<string, string>)[status] || status;
}

export function PropertyStructureManager({ propertyId, buildings, units }: { propertyId: string; buildings: Building[]; units: Unit[] }) {
  const router = useRouter();
  const [edit, setEdit] = useState<EditState>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const sortedUnits = useMemo(() => [...units].sort((a, b) => a.designation.localeCompare(b.designation, "sv")), [units]);

  function beginBuilding(item: Building) {
    setEdit({ kind: "building", id: item.id, values: { name: item.name, address: item.address || "", constructionYear: item.construction_year?.toString() || "", floors: item.floors?.toString() || "" } });
    setError(""); setMessage("");
  }

  function beginUnit(item: Unit) {
    setEdit({ kind: "unit", id: item.id, values: { designation: item.designation, unitType: item.unit_type, status: item.status, buildingId: item.building_id || "", floor: item.floor || "", area: item.area?.toString() || "", rooms: item.rooms?.toString() || "" } });
    setError(""); setMessage("");
  }

  async function save() {
    if (!edit) return;
    setBusy(edit.id); setError(""); setMessage("");
    try {
      const segment = edit.kind === "building" ? `buildings/${edit.id}` : `units/${edit.id}`;
      await requestJson(`/api/properties/${propertyId}/${segment}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(edit.values) });
      setMessage(edit.kind === "building" ? "Byggnaden har uppdaterats." : "Objektet har uppdaterats.");
      setEdit(null);
      router.refresh();
    } catch (value) { setError(value instanceof Error ? value.message : "Ändringen kunde inte sparas"); }
    finally { setBusy(null); }
  }

  async function remove(kind: "building" | "unit", id: string, label: string) {
    const confirmed = window.confirm(`Ta bort ${label}? Åtgärden kan inte ångras.`);
    if (!confirmed) return;
    setBusy(id); setError(""); setMessage("");
    try {
      const segment = kind === "building" ? `buildings/${id}` : `units/${id}`;
      await requestJson(`/api/properties/${propertyId}/${segment}`, { method: "DELETE" });
      setMessage(kind === "building" ? "Byggnaden har tagits bort." : "Objektet har tagits bort.");
      if (edit?.id === id) setEdit(null);
      router.refresh();
    } catch (value) { setError(value instanceof Error ? value.message : "Posten kunde inte tas bort"); }
    finally { setBusy(null); }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-premium-sm">
      <div className="border-b border-sand-200 px-6 py-5 sm:px-7">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-petroleum-600">Beståndsadministration</p>
        <h2 className="mt-2 text-xl font-semibold text-ink-950">Redigera byggnader och objekt</h2>
        <p className="mt-1 text-sm text-ink-500">Uppdatera struktur, status och kopplingar utan att lämna fastighetskortet.</p>
      </div>

      {(error || message) ? <div className={`border-b px-6 py-3 text-sm font-semibold ${error ? "border-red-100 bg-red-50 text-red-800" : "border-emerald-100 bg-emerald-50 text-emerald-800"}`}>{error || message}</div> : null}

      {edit ? <div className="border-b border-sand-200 bg-sand-50/70 p-6 sm:p-7">
        <div className="mb-5 flex items-start justify-between gap-4"><div><h3 className="font-semibold text-ink-950">{edit.kind === "building" ? "Redigera byggnad" : "Redigera objekt"}</h3><p className="mt-1 text-sm text-ink-500">Kontrollera uppgifterna innan du sparar.</p></div><button type="button" onClick={() => setEdit(null)} className="rounded-lg border border-sand-200 bg-white p-2 text-ink-500" aria-label="Stäng redigering"><X className="h-4 w-4" /></button></div>
        {edit.kind === "building" ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Namn"><input className={fieldClass} value={edit.values.name} onChange={(e) => setEdit({ ...edit, values: { ...edit.values, name: e.target.value } })} /></Field>
          <Field label="Adress"><input className={fieldClass} value={edit.values.address} onChange={(e) => setEdit({ ...edit, values: { ...edit.values, address: e.target.value } })} /></Field>
          <Field label="Byggår"><input type="number" className={fieldClass} value={edit.values.constructionYear} onChange={(e) => setEdit({ ...edit, values: { ...edit.values, constructionYear: e.target.value } })} /></Field>
          <Field label="Våningar"><input type="number" className={fieldClass} value={edit.values.floors} onChange={(e) => setEdit({ ...edit, values: { ...edit.values, floors: e.target.value } })} /></Field>
        </div> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Beteckning"><input className={fieldClass} value={edit.values.designation} onChange={(e) => setEdit({ ...edit, values: { ...edit.values, designation: e.target.value } })} /></Field>
          <Field label="Typ"><select className={fieldClass} value={edit.values.unitType} onChange={(e) => setEdit({ ...edit, values: { ...edit.values, unitType: e.target.value } })}><option value="apartment">Lägenhet</option><option value="commercial">Lokal</option><option value="storage">Förråd</option><option value="garage">Garage</option><option value="parking">Parkering</option><option value="technical">Tekniskt utrymme</option><option value="other">Övrigt</option></select></Field>
          <Field label="Status"><select className={fieldClass} value={edit.values.status} onChange={(e) => setEdit({ ...edit, values: { ...edit.values, status: e.target.value } })}><option value="active">Aktiv</option><option value="vacant">Vakant</option><option value="maintenance">Under åtgärd</option><option value="inactive">Inaktiv</option></select></Field>
          <Field label="Byggnad"><select className={fieldClass} value={edit.values.buildingId} onChange={(e) => setEdit({ ...edit, values: { ...edit.values, buildingId: e.target.value } })}><option value="">Ingen vald</option>{buildings.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
          <Field label="Våning"><input className={fieldClass} value={edit.values.floor} onChange={(e) => setEdit({ ...edit, values: { ...edit.values, floor: e.target.value } })} /></Field>
          <Field label="Area, m²"><input type="number" step="0.1" className={fieldClass} value={edit.values.area} onChange={(e) => setEdit({ ...edit, values: { ...edit.values, area: e.target.value } })} /></Field>
          <Field label="Rum"><input type="number" step="0.5" className={fieldClass} value={edit.values.rooms} onChange={(e) => setEdit({ ...edit, values: { ...edit.values, rooms: e.target.value } })} /></Field>
        </div>}
        <div className="mt-5 flex justify-end"><button type="button" onClick={() => void save()} disabled={busy === edit.id} className="rounded-lg bg-petroleum-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{busy === edit.id ? "Sparar…" : "Spara ändringar"}</button></div>
      </div> : null}

      <div className="grid xl:grid-cols-2">
        <div className="border-b border-sand-200 xl:border-b-0 xl:border-r">
          <div className="flex items-center gap-3 border-b border-sand-100 px-6 py-4"><Building2 className="h-5 w-5 text-petroleum-700" /><div><h3 className="font-semibold text-ink-900">Byggnader</h3><p className="text-xs text-ink-500">{buildings.length} registrerade</p></div></div>
          {buildings.length ? <div className="divide-y divide-sand-100">{buildings.map((item) => <article key={item.id} className="flex items-start justify-between gap-4 px-6 py-4"><div><p className="font-semibold text-ink-900">{item.name}</p><p className="mt-1 text-sm text-ink-500">{item.address || "Ingen separat adress"}{item.construction_year ? ` · ${item.construction_year}` : ""} · {item._count.units} objekt</p></div><div className="flex gap-2"><button type="button" onClick={() => beginBuilding(item)} className="rounded-lg border border-sand-200 p-2 text-ink-500 hover:text-petroleum-700" aria-label={`Redigera ${item.name}`}><Pencil className="h-4 w-4" /></button><button type="button" onClick={() => void remove("building", item.id, `byggnaden ${item.name}`)} disabled={busy === item.id} className="rounded-lg border border-sand-200 p-2 text-ink-500 hover:text-red-700 disabled:opacity-50" aria-label={`Ta bort ${item.name}`}><Trash2 className="h-4 w-4" /></button></div></article>)}</div> : <p className="p-8 text-center text-sm text-ink-500">Inga byggnader registrerade.</p>}
        </div>

        <div>
          <div className="flex items-center gap-3 border-b border-sand-100 px-6 py-4"><DoorOpen className="h-5 w-5 text-petroleum-700" /><div><h3 className="font-semibold text-ink-900">Objekt</h3><p className="text-xs text-ink-500">{units.length} registrerade</p></div></div>
          {sortedUnits.length ? <div className="max-h-[520px] divide-y divide-sand-100 overflow-y-auto">{sortedUnits.map((item) => <article key={item.id} className="flex items-start justify-between gap-4 px-6 py-4"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-ink-900">{item.designation}</p><span className="rounded-full bg-sand-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-ink-500">{statusLabel(item.status)}</span></div><p className="mt-1 text-sm text-ink-500">{unitTypeLabel(item.unit_type)}{item.building?.name ? ` · ${item.building.name}` : ""}{item.area ? ` · ${item.area} m²` : ""}</p></div><div className="flex gap-2"><button type="button" onClick={() => beginUnit(item)} className="rounded-lg border border-sand-200 p-2 text-ink-500 hover:text-petroleum-700" aria-label={`Redigera ${item.designation}`}><Pencil className="h-4 w-4" /></button><button type="button" onClick={() => void remove("unit", item.id, `objektet ${item.designation}`)} disabled={busy === item.id} className="rounded-lg border border-sand-200 p-2 text-ink-500 hover:text-red-700 disabled:opacity-50" aria-label={`Ta bort ${item.designation}`}><Trash2 className="h-4 w-4" /></button></div></article>)}</div> : <p className="p-8 text-center text-sm text-ink-500">Inga objekt registrerade.</p>}
        </div>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className={labelClass}>{label}{children}</label>;
}
