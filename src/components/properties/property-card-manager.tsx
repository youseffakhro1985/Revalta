"use client";

import { readResponseJson } from "@/lib/fetch-json";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Building2, ClipboardCheck, FileBadge2, Plus, ShieldCheck, Wrench } from "lucide-react";
import { EmptyState, InlineAlert, Panel, premiumFieldClass, premiumPrimaryButtonClass } from "@/components/dashboard/premium-ui";

type RecordItem = Record<string, unknown>;
type CardData = {
  property: { buildings: { id: string; name: string }[] };
  entrances: RecordItem[];
  assets: RecordItem[];
  warranties: RecordItem[];
  inspections: RecordItem[];
  agreements: RecordItem[];
};

type SectionKey = "entrance" | "asset" | "warranty" | "inspection" | "agreement";
type Props = { propertyId: string };

const sections: { key: SectionKey; label: string; icon: typeof Wrench }[] = [
  { key: "entrance", label: "Entré / trapphus", icon: Building2 },
  { key: "asset", label: "Installation", icon: Wrench },
  { key: "warranty", label: "Garanti", icon: ShieldCheck },
  { key: "inspection", label: "Besiktning", icon: ClipboardCheck },
  { key: "agreement", label: "Serviceavtal", icon: FileBadge2 },
];

const label = (item: RecordItem, section: SectionKey) => {
  if (section === "agreement") return String(item.supplier || "Serviceavtal");
  return String(item.name || item.title || "Post");
};

function fieldValue(item: RecordItem | undefined, key: string) {
  const aliases: Record<string, string> = {
    buildingId: "building_id", technicalAssetId: "technical_asset_id", serialNumber: "serial_number",
    installedAt: "installed_at", lastServiceAt: "last_service_at", nextServiceAt: "next_service_at",
    serviceProvider: "service_provider", startsAt: "starts_at", expiresAt: "expires_at",
    contactName: "contact_name", contactEmail: "contact_email", contactPhone: "contact_phone",
    documentUrl: "document_url", inspectionType: "inspection_type", scheduledAt: "scheduled_at",
    performedAt: "performed_at", nextDueAt: "next_due_at", serviceArea: "service_area",
    agreementNumber: "agreement_number", endsAt: "ends_at", noticePeriodMonths: "notice_period_months",
    costAmount: "cost_amount", costInterval: "cost_interval",
  };
  const value = item?.[aliases[key] || key];
  if (value == null) return "";
  if (key.endsWith("At")) return String(value).slice(0, 10);
  return String(value);
}

export function PropertyCardManager({ propertyId }: Props) {
  const [data, setData] = useState<CardData | null>(null);
  const [section, setSection] = useState<SectionKey>("asset");
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const endpoint = `/api/properties/${propertyId}/card`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const payload = await readResponseJson(response);
      if (!response.ok) throw new Error(payload.error || "Kunde inte hämta registerdata");
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte hämta registerdata");
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => { void load(); }, [load]);

  const items = useMemo(() => {
    if (!data) return [];
    if (section === "entrance") return data.entrances;
    if (section === "asset") return data.assets;
    if (section === "warranty") return data.warranties;
    if (section === "inspection") return data.inspections;
    return data.agreements;
  }, [data, section]);

  const selected = items.find((item) => String(item.id) === selectedId);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError(""); setSuccess("");
    try {
      const form = new FormData(event.currentTarget);
      const payload = Object.fromEntries(form.entries());
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, action: `${section}.save`, recordId: selectedId || undefined }),
      });
      const result = await readResponseJson(response);
      if (!response.ok) throw new Error(result.error || "Kunde inte spara posten");
      setSuccess(selectedId ? "Posten har uppdaterats." : "Posten har lagts till.");
      setSelectedId("");
      event.currentTarget.reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte spara posten");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="h-72 animate-pulse rounded-2xl bg-sand-100" />;
  if (!data) return <InlineAlert>{error || "Administrationen kunde inte laddas."}</InlineAlert>;

  return <Panel title="Administrera fastighetspärmen" description="Lägg till nya poster eller välj en befintlig post för att uppdatera den.">
    <div className="space-y-6">
      {(error || success) ? <div aria-live="polite"><InlineAlert tone={error ? "error" : "success"}>{error || success}</InlineAlert></div> : null}

      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Registertyp">
        {sections.map((item) => { const Icon = item.icon; const active = section === item.key; return <button key={item.key} type="button" onClick={() => { setSection(item.key); setSelectedId(""); setError(""); setSuccess(""); }} className={`inline-flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-semibold transition ${active ? "border-petroleum-200 bg-petroleum-50 text-petroleum-900" : "border-sand-200 bg-white text-ink-600 hover:bg-sand-50"}`}><Icon className="h-4 w-4" />{item.label}</button>; })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.72fr_1.28fr]">
        <div className="rounded-2xl border border-sand-200 bg-sand-50/60 p-4">
          <div className="flex items-center justify-between gap-3"><div><p className="font-semibold text-ink-900">Befintliga poster</p><p className="mt-1 text-xs text-ink-500">Välj en post för redigering.</p></div><button type="button" onClick={() => setSelectedId("")} className="inline-flex items-center gap-1.5 text-sm font-semibold text-petroleum-700"><Plus className="h-4 w-4" />Ny</button></div>
          {items.length === 0 ? <div className="mt-4"><EmptyState title="Inga poster" description="Skapa den första posten i formuläret." /></div> : <div className="mt-4 max-h-80 space-y-2 overflow-y-auto">{items.map((item) => <button key={String(item.id)} type="button" onClick={() => setSelectedId(String(item.id))} className={`w-full rounded-xl border p-3 text-left transition ${selectedId === String(item.id) ? "border-petroleum-200 bg-white shadow-sm" : "border-transparent bg-white/70 hover:border-sand-200"}`}><p className="font-semibold text-ink-900">{label(item, section)}</p><p className="mt-1 text-xs text-ink-500">{String(item.status || item.category || item.inspection_type || "Registrerad")}</p></button>)}</div>}
        </div>

        <form key={`${section}-${selectedId}`} onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="recordId" value={selectedId} />
          {section === "entrance" ? <>
            <Field label="Namn"><input name="name" required defaultValue={fieldValue(selected, "name")} className={premiumFieldClass} placeholder="Ex. Trapphus A" /></Field>
            <BuildingSelect data={data} selected={fieldValue(selected, "buildingId")} />
            <Field label="Adress"><input name="address" defaultValue={fieldValue(selected, "address")} className={premiumFieldClass} /></Field>
            <Field label="Antal våningar"><input name="floors" type="number" min="0" defaultValue={fieldValue(selected, "floors")} className={premiumFieldClass} /></Field>
            <Field label="Tillgänglighet"><input name="accessibility" defaultValue={fieldValue(selected, "accessibility")} className={premiumFieldClass} placeholder="Hiss, ramp, automatisk dörr" /></Field>
            <StatusSelect name="status" value={fieldValue(selected, "status") || "active"} options={[['active','Aktiv'],['inactive','Inaktiv']]} />
          </> : null}

          {section === "asset" ? <>
            <Field label="Namn"><input name="name" required defaultValue={fieldValue(selected, "name")} className={premiumFieldClass} placeholder="Ex. Hiss 1" /></Field>
            <Field label="Kategori"><select name="category" required defaultValue={fieldValue(selected, "category") || "elevator"} className={premiumFieldClass}>{[['elevator','Hiss'],['ventilation','Ventilation'],['heating','Värme'],['electricity','El'],['water','VA'],['fire','Brandskydd'],['access','Passersystem'],['other','Övrigt']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></Field>
            <BuildingSelect data={data} selected={fieldValue(selected, "buildingId")} />
            <Field label="Placering"><input name="location" defaultValue={fieldValue(selected, "location")} className={premiumFieldClass} /></Field>
            <Field label="Fabrikat"><input name="manufacturer" defaultValue={fieldValue(selected, "manufacturer")} className={premiumFieldClass} /></Field>
            <Field label="Modell"><input name="model" defaultValue={fieldValue(selected, "model")} className={premiumFieldClass} /></Field>
            <Field label="Serienummer"><input name="serialNumber" defaultValue={fieldValue(selected, "serialNumber")} className={premiumFieldClass} /></Field>
            <Field label="Serviceleverantör"><input name="serviceProvider" defaultValue={fieldValue(selected, "serviceProvider")} className={premiumFieldClass} /></Field>
            <Field label="Nästa service"><input name="nextServiceAt" type="date" defaultValue={fieldValue(selected, "nextServiceAt")} className={premiumFieldClass} /></Field>
            <Field label="Kritikalitet"><select name="criticality" defaultValue={fieldValue(selected, "criticality") || "normal"} className={premiumFieldClass}>{[['low','Låg'],['normal','Normal'],['high','Hög'],['critical','Kritisk']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></Field>
            <StatusSelect name="status" value={fieldValue(selected, "status") || "active"} options={[['active','Aktiv'],['service_due','Service krävs'],['out_of_service','Ur drift'],['decommissioned','Avvecklad']]} />
          </> : null}

          {section === "warranty" ? <>
            <Field label="Titel"><input name="title" required defaultValue={fieldValue(selected, "title")} className={premiumFieldClass} /></Field>
            <AssetSelect data={data} selected={fieldValue(selected, "technicalAssetId")} />
            <Field label="Leverantör"><input name="supplier" defaultValue={fieldValue(selected, "supplier")} className={premiumFieldClass} /></Field>
            <Field label="Gäller från"><input name="startsAt" type="date" defaultValue={fieldValue(selected, "startsAt")} className={premiumFieldClass} /></Field>
            <Field label="Gäller till"><input name="expiresAt" type="date" defaultValue={fieldValue(selected, "expiresAt")} className={premiumFieldClass} /></Field>
            <Field label="Dokumentlänk"><input name="documentUrl" type="url" defaultValue={fieldValue(selected, "documentUrl")} className={premiumFieldClass} /></Field>
            <Field label="Omfattning" wide><textarea name="scope" rows={3} defaultValue={fieldValue(selected, "scope")} className={premiumFieldClass} /></Field>
          </> : null}

          {section === "inspection" ? <>
            <Field label="Titel"><input name="title" required defaultValue={fieldValue(selected, "title")} className={premiumFieldClass} /></Field>
            <Field label="Besiktningstyp"><input name="inspectionType" required defaultValue={fieldValue(selected, "inspectionType")} className={premiumFieldClass} placeholder="Ex. OVK" /></Field>
            <AssetSelect data={data} selected={fieldValue(selected, "technicalAssetId")} />
            <Field label="Besiktningsföretag"><input name="provider" defaultValue={fieldValue(selected, "provider")} className={premiumFieldClass} /></Field>
            <Field label="Planerat datum"><input name="scheduledAt" type="date" defaultValue={fieldValue(selected, "scheduledAt")} className={premiumFieldClass} /></Field>
            <Field label="Nästa förfallodatum"><input name="nextDueAt" type="date" defaultValue={fieldValue(selected, "nextDueAt")} className={premiumFieldClass} /></Field>
            <StatusSelect name="status" value={fieldValue(selected, "status") || "planned"} options={[['planned','Planerad'],['completed','Genomförd'],['approved','Godkänd'],['remark','Anmärkning'],['overdue','Försenad']]} />
            <Field label="Sammanfattning" wide><textarea name="summary" rows={3} defaultValue={fieldValue(selected, "summary")} className={premiumFieldClass} /></Field>
          </> : null}

          {section === "agreement" ? <>
            <Field label="Leverantör"><input name="supplier" required defaultValue={fieldValue(selected, "supplier")} className={premiumFieldClass} /></Field>
            <Field label="Tjänsteområde"><input name="serviceArea" required defaultValue={fieldValue(selected, "serviceArea")} className={premiumFieldClass} placeholder="Ex. Hissservice" /></Field>
            <AssetSelect data={data} selected={fieldValue(selected, "technicalAssetId")} />
            <Field label="Avtalsnummer"><input name="agreementNumber" defaultValue={fieldValue(selected, "agreementNumber")} className={premiumFieldClass} /></Field>
            <Field label="Startdatum"><input name="startsAt" type="date" defaultValue={fieldValue(selected, "startsAt")} className={premiumFieldClass} /></Field>
            <Field label="Slutdatum"><input name="endsAt" type="date" defaultValue={fieldValue(selected, "endsAt")} className={premiumFieldClass} /></Field>
            <Field label="Kostnad"><input name="costAmount" type="number" min="0" step="0.01" defaultValue={fieldValue(selected, "costAmount")} className={premiumFieldClass} /></Field>
            <Field label="Kostnadsintervall"><select name="costInterval" defaultValue={fieldValue(selected, "costInterval") || "yearly"} className={premiumFieldClass}><option value="monthly">Månad</option><option value="quarterly">Kvartal</option><option value="yearly">År</option></select></Field>
            <Field label="Uppsägningstid, månader"><input name="noticePeriodMonths" type="number" min="0" defaultValue={fieldValue(selected, "noticePeriodMonths")} className={premiumFieldClass} /></Field>
            <StatusSelect name="status" value={fieldValue(selected, "status") || "active"} options={[['active','Aktivt'],['expired','Utgånget'],['cancelled','Uppsagt']]} />
          </> : null}

          {section !== "warranty" && section !== "inspection" && section !== "agreement" ? <Field label="Anteckningar" wide><textarea name="notes" rows={3} defaultValue={fieldValue(selected, "notes")} className={premiumFieldClass} /></Field> : null}
          <button disabled={saving} className={`${premiumPrimaryButtonClass} sm:col-span-2`}>{saving ? "Sparar…" : selectedId ? "Uppdatera post" : "Lägg till post"}</button>
        </form>
      </div>
    </div>
  </Panel>;
}

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) { return <label className={`space-y-1.5 text-sm text-ink-600 ${wide ? "sm:col-span-2" : ""}`}><span>{label}</span>{children}</label>; }
function BuildingSelect({ data, selected }: { data: CardData; selected: string }) { return <Field label="Byggnad"><select name="buildingId" defaultValue={selected} className={premiumFieldClass}><option value="">Hela fastigheten</option>{data.property.buildings.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>; }
function AssetSelect({ data, selected }: { data: CardData; selected: string }) { return <Field label="Kopplad installation"><select name="technicalAssetId" defaultValue={selected} className={premiumFieldClass}><option value="">Ingen särskild installation</option>{data.assets.map(item=><option key={String(item.id)} value={String(item.id)}>{String(item.name)}</option>)}</select></Field>; }
function StatusSelect({ name, value, options }: { name: string; value: string; options: string[][] }) { return <Field label="Status"><select name={name} defaultValue={value} className={premiumFieldClass}>{options.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></Field>; }
