"use client";

import { readResponseJson } from "@/lib/fetch-json";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { CircleDollarSign, ClipboardCheck, Save, Settings2 } from "lucide-react";
import { EmptyState, InlineAlert, Panel, premiumFieldClass } from "@/components/dashboard/premium-ui";

type Asset = Record<string, unknown>;
type Data = { assets: Asset[] };
type Mode = "update" | "event" | "cost";

const eventLabels: Record<string, string> = {
  installation: "Installation", commissioning: "Driftsättning", service: "Service", repair: "Reparation",
  inspection: "Besiktning", warranty: "Garantiärende", damage: "Skada", replacement: "Komponentbyte",
  shutdown: "Avställning", restart: "Återstart",
};
const costLabels: Record<string, string> = {
  service: "Service", repair: "Reparation", spare_part: "Reservdel", inspection: "Besiktning",
  contractor: "Entreprenör", investment: "Investering", replacement: "Komponentbyte", other: "Övrigt",
};

function text(item: Asset | undefined, key: string) { return item?.[key] == null ? "" : String(item[key]); }
function dateInput(value: unknown) { if (!value) return ""; const parsed = new Date(String(value)); return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10); }

export function ComponentRegistryManager({ propertyId }: { propertyId: string }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetId, setAssetId] = useState("");
  const [mode, setMode] = useState<Mode>("update");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/properties/${propertyId}/components`, { cache: "no-store" });
      const payload: Data & { error?: string } = await readResponseJson(response);
      if (!response.ok) throw new Error(payload.error || "Kunde inte hämta komponenterna");
      setAssets(payload.assets || []);
      setAssetId((current) => current || String(payload.assets?.[0]?.id || ""));
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte hämta komponenterna");
    } finally { setLoading(false); }
  }, [propertyId]);

  useEffect(() => { void load(); }, [load]);
  const selected = useMemo(() => assets.find((item) => String(item.id) === assetId), [assets, assetId]);
  const formLocked = saving || loading || !assetId;

  useEffect(() => {
    if (loading) return;
    if (window.location.hash !== "#spara-komponentregister") return;
    document.getElementById("spara-komponentregister")?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => document.getElementById("register-klass")?.focus(), 0);
  }, [loading, assets]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setSuccess("");
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const response = await fetch(`/api/properties/${propertyId}/components/manage`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, action: mode, assetId }),
      });
      const payload = await readResponseJson(response);
      if (!response.ok) throw new Error(payload.error || "Kunde inte spara");
      setSuccess(mode === "update" ? "Komponentuppgifterna har uppdaterats." : mode === "event" ? "Livscykelhändelsen har registrerats." : "Kostnaden har registrerats.");
      if (mode !== "update") event.currentTarget.reset();
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte spara");
    } finally { setSaving(false); }
  }

  if (!loading && error && assets.length === 0) return <InlineAlert>{error}</InlineAlert>;
  if (!loading && assets.length === 0) return <EmptyState title="Inga komponenter att administrera" description="Registrera först en teknisk installation i fastighetskortet." />;

  return (
    <div id="spara-komponentregister" className="scroll-mt-36">
    <Panel title="Administrera komponentregister" description="Uppdatera livslängd och skick eller registrera service, besiktningar och kostnader.">
      <div className="space-y-5">
        {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
        {success ? <InlineAlert tone="success">{success}</InlineAlert> : null}

        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">Komponent</span><select disabled={formLocked} aria-label="Komponent" value={assetId} onChange={(event) => setAssetId(event.target.value)} className={premiumFieldClass}>{assets.length === 0 ? <option value="">Laddar komponenter…</option> : assets.map((item) => <option key={String(item.id)} value={String(item.id)}>{text(item, "name")}{text(item, "building_name") ? ` · ${text(item, "building_name")}` : ""}</option>)}</select></label>
          <div className="grid grid-cols-3 rounded-xl bg-sand-50 p-1">
            <ModeButton active={mode === "update"} disabled={formLocked} onClick={() => setMode("update")} icon={Settings2}>Grunddata</ModeButton>
            <ModeButton active={mode === "event"} disabled={formLocked} onClick={() => setMode("event")} icon={ClipboardCheck}>Händelse</ModeButton>
            <ModeButton active={mode === "cost"} disabled={formLocked} onClick={() => setMode("cost")} icon={CircleDollarSign}>Kostnad</ModeButton>
          </div>
        </div>

        <form key={`${assetId}-${mode}`} onSubmit={submit} className="space-y-4">
          {mode === "update" ? <UpdateFields asset={selected} disabled={formLocked} /> : null}
          {mode === "event" ? <EventFields disabled={formLocked} /> : null}
          {mode === "cost" ? <CostFields disabled={formLocked} /> : null}
          <button disabled={formLocked} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-petroleum-800 px-5 text-sm font-semibold text-white transition hover:bg-petroleum-900 disabled:opacity-50"><Save className="h-4 w-4" />{saving ? "Sparar…" : "Spara"}</button>
        </form>
      </div>
    </Panel>
    </div>
  );
}

function UpdateFields({ asset, disabled }: { asset?: Asset; disabled: boolean }) {
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
    <Field id="register-klass" autoFocus disabled={disabled} label="Komponentklass" name="componentClass" defaultValue={text(asset, "component_class")} />
    <Field disabled={disabled} label="Installationsår" name="installationYear" type="number" defaultValue={text(asset, "installation_year")} />
    <Field disabled={disabled} label="Driftsatt" name="commissionedAt" type="date" defaultValue={dateInput(asset?.commissioned_at)} />
    <Field disabled={disabled} label="Teknisk livslängd, år" name="technicalLifetimeYears" type="number" defaultValue={text(asset, "technical_lifetime_years")} />
    <Field disabled={disabled} label="Ekonomisk livslängd, år" name="economicLifetimeYears" type="number" defaultValue={text(asset, "economic_lifetime_years")} />
    <Field disabled={disabled} label="Beräknat utbytesår" name="expectedReplacementYear" type="number" defaultValue={text(asset, "expected_replacement_year")} />
    <label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">Skick 1–5</span><select disabled={disabled} name="conditionGrade" defaultValue={text(asset, "condition_grade")} className={premiumFieldClass}><option value="">Ej bedömt</option>{[1,2,3,4,5].map((value) => <option key={value} value={value}>{value} – {value <= 2 ? "Gott" : value === 3 ? "Godtagbart" : value === 4 ? "Dåligt" : "Kritiskt"}</option>)}</select></label>
    <Field disabled={disabled} label="Återanskaffningsvärde exkl. moms" name="replacementValue" type="number" defaultValue={text(asset, "replacement_value")} />
    <Field disabled={disabled} label="Ansvarig leverantör" name="responsibleSupplier" defaultValue={text(asset, "responsible_supplier")} />
  </div>;
}

function EventFields({ disabled }: { disabled: boolean }) {
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
    <label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">Händelsetyp</span><select disabled={disabled} name="eventType" className={premiumFieldClass}>{Object.entries(eventLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <Field disabled={disabled} label="Datum" name="eventDate" type="date" required />
    <Field autoFocus disabled={disabled} label="Rubrik" name="title" required />
    <Field disabled={disabled} label="Leverantör/utförare" name="provider" />
    <Field disabled={disabled} label="Resultat" name="result" />
    <Field disabled={disabled} label="Nästa förfallodatum" name="nextDueAt" type="date" />
    <Field disabled={disabled} label="Mätarställning" name="meterReading" type="number" />
    <label className="block sm:col-span-2 xl:col-span-3"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">Beskrivning</span><textarea disabled={disabled} name="description" rows={3} className={premiumFieldClass} /></label>
  </div>;
}

function CostFields({ disabled }: { disabled: boolean }) {
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
    <label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">Kostnadstyp</span><select disabled={disabled} name="costType" className={premiumFieldClass}>{Object.entries(costLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <Field disabled={disabled} label="Kostnadsdatum" name="costDate" type="date" required />
    <Field autoFocus disabled={disabled} label="Belopp exkl. moms" name="amountExVat" type="number" required />
    <Field disabled={disabled} label="Moms %" name="vatRate" type="number" defaultValue="25" />
    <Field disabled={disabled} label="Leverantör" name="supplier" />
    <Field disabled={disabled} label="Beskrivning" name="description" />
  </div>;
}

function Field({ label, name, type = "text", defaultValue = "", required = false, disabled = false, autoFocus = false, id }: { label: string; name: string; type?: string; defaultValue?: string; required?: boolean; disabled?: boolean; autoFocus?: boolean; id?: string }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</span><input id={id} autoFocus={autoFocus} disabled={disabled} name={name} type={type} defaultValue={defaultValue} required={required} min={type === "number" ? 0 : undefined} step={type === "number" ? "any" : undefined} className={premiumFieldClass} /></label>;
}

function ModeButton({ active, onClick, icon: Icon, children, disabled }: { active: boolean; onClick: () => void; icon: typeof Settings2; children: React.ReactNode; disabled?: boolean }) {
  return <button type="button" disabled={disabled} onClick={onClick} aria-pressed={active} className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition disabled:opacity-50 ${active ? "bg-white text-petroleum-800 shadow-sm" : "text-ink-500 hover:text-ink-800"}`}><Icon className="h-4 w-4" />{children}</button>;
}
