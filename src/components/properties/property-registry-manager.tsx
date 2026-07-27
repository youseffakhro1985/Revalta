"use client";

import { readResponseJson } from "@/lib/fetch-json";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Building = { id: string; name: string };

type PropertyValues = {
  name: string;
  address: string;
  postalCode: string;
  city: string;
  propertyIdentifier: string;
  propertyType: string;
  status: string;
  constructionYear: string;
  totalArea: string;
  boa: string;
  loa: string;
  managerName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
};

const inputClass = "mt-1 block w-full rounded-lg border border-sand-200 bg-white px-3 py-2.5 text-sm text-ink-900 outline-none transition focus:border-petroleum-500 focus:ring-2 focus:ring-petroleum-100";
const labelClass = "text-xs font-semibold uppercase tracking-[0.08em] text-ink-500";

async function requestJson(url: string, options: RequestInit) {
  const response = await fetch(url, options);
  const data = await readResponseJson(response);
  if (!response.ok) throw new Error(data.error || "Kunde inte spara ändringen");
  return data;
}

export function PropertyRegistryManager({
  propertyId,
  initialValues,
  buildings,
  canManage = false,
}: {
  propertyId: string;
  initialValues: PropertyValues;
  buildings: Building[];
  canManage?: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initialValues);
  const [building, setBuilding] = useState({ name: "", address: "", constructionYear: "", floors: "" });
  const [unit, setUnit] = useState({ designation: "", unitType: "apartment", buildingId: "", floor: "", area: "", rooms: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  function updateValue(field: keyof PropertyValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function saveProperty(event: React.FormEvent) {
    event.preventDefault();
    setBusy("property"); setError(""); setMessage("");
    try {
      await requestJson(`/api/properties/${propertyId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      setMessage("Fastighetsuppgifterna har sparats.");
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Kunde inte spara"); }
    finally { setBusy(null); }
  }

  async function addBuilding(event: React.FormEvent) {
    event.preventDefault();
    setBusy("building"); setError(""); setMessage("");
    try {
      await requestJson(`/api/properties/${propertyId}/buildings`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(building) });
      setBuilding({ name: "", address: "", constructionYear: "", floors: "" });
      setMessage("Byggnaden har lagts till.");
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Kunde inte skapa byggnaden"); }
    finally { setBusy(null); }
  }

  async function addUnit(event: React.FormEvent) {
    event.preventDefault();
    setBusy("unit"); setError(""); setMessage("");
    try {
      await requestJson(`/api/properties/${propertyId}/units`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(unit) });
      setUnit({ designation: "", unitType: "apartment", buildingId: "", floor: "", area: "", rooms: "" });
      setMessage("Objektet har lagts till.");
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Kunde inte skapa objektet"); }
    finally { setBusy(null); }
  }

  async function softDeleteProperty() {
    if (!window.confirm("Ta bort fastigheten? Den döljs från listor men behålls i historiken.")) return;
    setDeleting(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/properties/${propertyId}`, { method: "DELETE" });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte ta bort fastigheten");
      router.push(`/dashboard/fastigheter?deleted=${encodeURIComponent(propertyId)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte ta bort fastigheten");
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      {(message || error) && <div className={`rounded-xl border px-4 py-3 text-sm font-medium ${error ? "border-danger-200 bg-danger-50 text-danger-700" : "border-success-200 bg-success-50 text-success-700"}`}>{error || message}</div>}

      <form onSubmit={saveProperty} className="rounded-2xl border border-sand-200 bg-white p-6 shadow-premium-sm sm:p-7">
        <div className="mb-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-petroleum-600">Fastighetsdata</p>
          <h2 className="mt-2 text-xl font-semibold text-ink-950">Redigera grunduppgifter</h2>
          <p className="mt-1 text-sm text-ink-500">Samla den information som behövs i förvaltning, rapportering och arbetsorder.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[
            ["name", "Fastighetsnamn"], ["propertyIdentifier", "Fastighetsbeteckning"], ["address", "Adress"], ["postalCode", "Postnummer"], ["city", "Ort"], ["constructionYear", "Byggår"], ["totalArea", "Total area, m²"], ["boa", "BOA, m²"], ["loa", "LOA, m²"], ["managerName", "Ansvarig förvaltare"], ["contactName", "Kontaktperson"], ["contactEmail", "Kontaktens e-post"], ["contactPhone", "Kontaktens telefon"],
          ].map(([field, label]) => <label key={field} className={labelClass}>{label}<input className={inputClass} value={values[field as keyof PropertyValues]} onChange={(event) => updateValue(field as keyof PropertyValues, event.target.value)} required={["name", "address", "city"].includes(field)} /></label>)}
          <label className={labelClass}>Fastighetstyp<select className={inputClass} value={values.propertyType} onChange={(event) => updateValue("propertyType", event.target.value)}><option value="residential">Bostäder</option><option value="commercial">Kommersiell</option><option value="mixed">Blandfastighet</option><option value="community">Samhällsfastighet</option><option value="industrial">Industri</option><option value="other">Övrig</option></select></label>
          <label className={labelClass}>Status<select className={inputClass} value={values.status} onChange={(event) => updateValue("status", event.target.value)}><option value="active">Aktiv</option><option value="planning">Planering</option><option value="inactive">Inaktiv</option><option value="sold">Avyttrad</option></select></label>
        </div>
        <div className="mt-6 flex items-center justify-between gap-4">
          {canManage ? (
            <button
              type="button"
              disabled={deleting || busy !== null}
              onClick={() => void softDeleteProperty()}
              className="text-xs font-semibold text-red-700 transition hover:text-red-900 disabled:opacity-60"
            >
              {deleting ? "Tar bort…" : "Ta bort fastighet"}
            </button>
          ) : <span />}
          <button disabled={busy === "property"} className="rounded-lg bg-petroleum-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-petroleum-800 disabled:opacity-60">{busy === "property" ? "Sparar..." : "Spara fastighetsuppgifter"}</button>
        </div>
      </form>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <form onSubmit={addBuilding} className="rounded-2xl border border-sand-200 bg-white p-6 shadow-premium-sm sm:p-7">
          <h2 className="text-xl font-semibold text-ink-950">Lägg till byggnad</h2><p className="mt-1 text-sm text-ink-500">Skapa byggnadsstrukturen innan lägenheter och lokaler registreras.</p>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className={labelClass}>Namn<input required className={inputClass} value={building.name} onChange={(e) => setBuilding({ ...building, name: e.target.value })} placeholder="Hus A" /></label>
            <label className={labelClass}>Adress<input className={inputClass} value={building.address} onChange={(e) => setBuilding({ ...building, address: e.target.value })} /></label>
            <label className={labelClass}>Byggår<input type="number" className={inputClass} value={building.constructionYear} onChange={(e) => setBuilding({ ...building, constructionYear: e.target.value })} /></label>
            <label className={labelClass}>Våningar<input type="number" className={inputClass} value={building.floors} onChange={(e) => setBuilding({ ...building, floors: e.target.value })} /></label>
          </div>
          <button disabled={busy === "building"} className="mt-5 rounded-lg border border-petroleum-700 px-4 py-2.5 text-sm font-semibold text-petroleum-800 transition hover:bg-petroleum-50 disabled:opacity-60">{busy === "building" ? "Lägger till..." : "Lägg till byggnad"}</button>
        </form>

        <form onSubmit={addUnit} className="rounded-2xl border border-sand-200 bg-white p-6 shadow-premium-sm sm:p-7">
          <h2 className="text-xl font-semibold text-ink-950">Lägg till lägenhet eller lokal</h2><p className="mt-1 text-sm text-ink-500">Objektet kan kopplas till en byggnad och användas i kommande ärendeflöden.</p>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className={labelClass}>Beteckning<input required className={inputClass} value={unit.designation} onChange={(e) => setUnit({ ...unit, designation: e.target.value })} placeholder="Lgh 1201" /></label>
            <label className={labelClass}>Typ<select className={inputClass} value={unit.unitType} onChange={(e) => setUnit({ ...unit, unitType: e.target.value })}><option value="apartment">Lägenhet</option><option value="commercial">Lokal</option><option value="storage">Förråd</option><option value="garage">Garage</option><option value="parking">Parkering</option><option value="technical">Tekniskt utrymme</option><option value="other">Övrigt</option></select></label>
            <label className={labelClass}>Byggnad<select className={inputClass} value={unit.buildingId} onChange={(e) => setUnit({ ...unit, buildingId: e.target.value })}><option value="">Ingen vald</option>{buildings.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className={labelClass}>Våning<input className={inputClass} value={unit.floor} onChange={(e) => setUnit({ ...unit, floor: e.target.value })} /></label>
            <label className={labelClass}>Area, m²<input type="number" step="0.1" className={inputClass} value={unit.area} onChange={(e) => setUnit({ ...unit, area: e.target.value })} /></label>
            <label className={labelClass}>Rum<input type="number" step="0.5" className={inputClass} value={unit.rooms} onChange={(e) => setUnit({ ...unit, rooms: e.target.value })} /></label>
          </div>
          <button disabled={busy === "unit"} className="mt-5 rounded-lg border border-petroleum-700 px-4 py-2.5 text-sm font-semibold text-petroleum-800 transition hover:bg-petroleum-50 disabled:opacity-60">{busy === "unit" ? "Lägger till..." : "Lägg till objekt"}</button>
        </form>
      </div>
    </div>
  );
}