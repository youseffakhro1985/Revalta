"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ClipboardPlus } from "lucide-react";
import {
  InlineAlert,
  PageHeader,
  Panel,
  premiumFieldClass,
  premiumPrimaryButtonClass,
  premiumSecondaryButtonClass,
  premiumTextareaClass,
} from "@/components/dashboard/premium-ui";

type PropertyOption = {
  id: string;
  name: string;
  address: string;
  city: string;
  buildings: { id: string; name: string; address: string | null }[];
  units: { id: string; designation: string; unit_type: string; building_id: string | null }[];
};

type UserOption = { id: string; name: string | null; email: string; role: string };

type OptionsResponse = {
  properties?: PropertyOption[];
  users?: UserOption[];
  error?: string;
};

const initialForm = {
  propertyId: "",
  buildingId: "",
  unitId: "",
  assignedToId: "",
  title: "",
  description: "",
  status: "planned",
  priority: "normal",
  workType: "corrective",
  source: "internal",
  scheduledStart: "",
  scheduledEnd: "",
  estimatedCost: "",
};

export default function NewWorkOrderPage() {
  const router = useRouter();
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    async function loadOptions() {
      try {
        const response = await fetch("/api/work-orders/options", { cache: "no-store" });
        const data = (await response.json()) as OptionsResponse;
        if (response.status === 401) {
          router.push("/login");
          return;
        }
        if (!response.ok) throw new Error(data.error || "Kunde inte hämta val för arbetsordern");
        if (!mounted) return;
        setProperties(data.properties || []);
        setUsers(data.users || []);
      } catch (cause) {
        if (mounted) setError(cause instanceof Error ? cause.message : "Kunde inte hämta val för arbetsordern");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void loadOptions();
    return () => {
      mounted = false;
    };
  }, [router]);

  const selectedProperty = useMemo(
    () => properties.find((property) => property.id === form.propertyId) || null,
    [form.propertyId, properties],
  );

  const units = useMemo(() => {
    if (!selectedProperty) return [];
    return form.buildingId
      ? selectedProperty.units.filter((unit) => unit.building_id === form.buildingId)
      : selectedProperty.units;
  }, [form.buildingId, selectedProperty]);

  function updateField(name: keyof typeof initialForm, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/work-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          buildingId: form.buildingId || null,
          unitId: form.unitId || null,
          assignedToId: form.assignedToId || null,
          scheduledStart: form.scheduledStart || null,
          scheduledEnd: form.scheduledEnd || null,
          estimatedCost: form.estimatedCost || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunde inte skapa arbetsordern");
      router.push(`/dashboard/arbetsorder/${data.workOrder.id}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunde inte skapa arbetsordern");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Operativ förvaltning"
        title="Ny arbetsorder"
        description="Skapa en spårbar arbetsorder med ansvar, prioritet, SLA, kostnadsram och tydlig koppling till fastighet och objekt."
        action={
          <Link href="/dashboard/arbetsorder" className={premiumSecondaryButtonClass}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Till arbetsordrar
          </Link>
        }
      />

      {error ? <InlineAlert>{error}</InlineAlert> : null}

      <form onSubmit={submit} className="space-y-6">
        <Panel title="Omfattning" description="Välj var arbetet ska utföras och vem som ansvarar för genomförandet.">
          <div className="grid gap-5 md:grid-cols-2">
            <label className="space-y-2 text-sm font-medium text-ink-700">
              Fastighet <span className="text-red-600">*</span>
              <select
                className={premiumFieldClass}
                value={form.propertyId}
                disabled={loading}
                required
                onChange={(event) => {
                  setForm((current) => ({ ...current, propertyId: event.target.value, buildingId: "", unitId: "" }));
                }}
              >
                <option value="">Välj fastighet</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name} – {property.address}, {property.city}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-sm font-medium text-ink-700">
              Ansvarig utförare
              <select className={premiumFieldClass} value={form.assignedToId} disabled={loading} onChange={(event) => updateField("assignedToId", event.target.value)}>
                <option value="">Ej tilldelad</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name || user.email} ({user.role})
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-sm font-medium text-ink-700">
              Byggnad
              <select
                className={premiumFieldClass}
                value={form.buildingId}
                disabled={!selectedProperty}
                onChange={(event) => setForm((current) => ({ ...current, buildingId: event.target.value, unitId: "" }))}
              >
                <option value="">Ingen särskild byggnad</option>
                {selectedProperty?.buildings.map((building) => (
                  <option key={building.id} value={building.id}>{building.name}</option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-sm font-medium text-ink-700">
              Objekt eller enhet
              <select className={premiumFieldClass} value={form.unitId} disabled={!selectedProperty} onChange={(event) => updateField("unitId", event.target.value)}>
                <option value="">Ingen särskild enhet</option>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>{unit.designation} – {unit.unit_type}</option>
                ))}
              </select>
            </label>
          </div>
        </Panel>

        <Panel title="Arbetsbeskrivning" description="Beskriv uppdraget tydligt så att utföraren kan agera utan kompletterande frågor.">
          <div className="space-y-5">
            <label className="space-y-2 text-sm font-medium text-ink-700">
              Rubrik <span className="text-red-600">*</span>
              <input className={premiumFieldClass} maxLength={180} required value={form.title} onChange={(event) => updateField("title", event.target.value)} placeholder="Exempel: Åtgärda läckande blandare i lägenhet 1203" />
            </label>
            <label className="space-y-2 text-sm font-medium text-ink-700">
              Beskrivning <span className="text-red-600">*</span>
              <textarea className={premiumTextareaClass} maxLength={10000} required value={form.description} onChange={(event) => updateField("description", event.target.value)} placeholder="Beskriv fel, önskat resultat, åtkomstförutsättningar och annan viktig information." />
            </label>
          </div>
        </Panel>

        <Panel title="Planering och ekonomi" description="Sätt prioritet, arbetsform, tidplan och uppskattad kostnad.">
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <label className="space-y-2 text-sm font-medium text-ink-700">
              Prioritet
              <select className={premiumFieldClass} value={form.priority} onChange={(event) => updateField("priority", event.target.value)}>
                <option value="low">Låg</option><option value="normal">Normal</option><option value="high">Hög</option><option value="urgent">Akut</option>
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium text-ink-700">
              Arbetstyp
              <select className={premiumFieldClass} value={form.workType} onChange={(event) => updateField("workType", event.target.value)}>
                <option value="corrective">Avhjälpande</option><option value="preventive">Förebyggande</option><option value="inspection">Besiktning</option><option value="emergency">Akut</option><option value="project">Projekt</option><option value="warranty">Garanti</option>
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium text-ink-700">
              Ursprung
              <select className={premiumFieldClass} value={form.source} onChange={(event) => updateField("source", event.target.value)}>
                <option value="internal">Internt</option><option value="ticket">Ärende</option><option value="maintenance_plan">Underhållsplan</option><option value="inspection">Besiktning</option><option value="resident">Boende</option><option value="supplier">Leverantör</option>
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium text-ink-700">
              Planerad start
              <input type="datetime-local" className={premiumFieldClass} value={form.scheduledStart} onChange={(event) => updateField("scheduledStart", event.target.value)} />
            </label>
            <label className="space-y-2 text-sm font-medium text-ink-700">
              Planerat slut
              <input type="datetime-local" className={premiumFieldClass} value={form.scheduledEnd} onChange={(event) => updateField("scheduledEnd", event.target.value)} />
            </label>
            <label className="space-y-2 text-sm font-medium text-ink-700">
              Beräknad kostnad exkl. moms
              <input type="number" min="0" step="0.01" inputMode="decimal" className={premiumFieldClass} value={form.estimatedCost} onChange={(event) => updateField("estimatedCost", event.target.value)} placeholder="0,00" />
            </label>
          </div>
        </Panel>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Link href="/dashboard/arbetsorder" className={premiumSecondaryButtonClass}>Avbryt</Link>
          <button type="submit" disabled={saving || loading || !form.propertyId} className={premiumPrimaryButtonClass}>
            <ClipboardPlus className="mr-2 h-4 w-4" />
            {saving ? "Skapar arbetsorder…" : "Skapa arbetsorder"}
          </button>
        </div>
      </form>
    </div>
  );
}
