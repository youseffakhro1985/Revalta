"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPlus } from "lucide-react";
import { InlineAlert, Panel, premiumFieldClass, premiumPrimaryButtonClass } from "@/components/dashboard/premium-ui";

type Props = {
  propertyId: string;
  buildingId: string | null;
  componentId: string;
  componentName: string;
  componentCategory: string;
  componentLocation: string;
  criticality: string;
};

const priorityByCriticality: Record<string, string> = {
  low: "low",
  normal: "normal",
  high: "high",
  critical: "urgent",
};

export function ComponentWorkOrderPanel(props: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const payload = {
      propertyId: props.propertyId,
      buildingId: props.buildingId,
      technicalAssetId: props.componentId,
      title: String(form.get("title") || "").trim(),
      description: String(form.get("description") || "").trim(),
      status: "planned",
      priority: String(form.get("priority") || "normal"),
      workType: String(form.get("workType") || "corrective"),
      source: "component",
      scheduledStart: form.get("scheduledStart") || null,
      scheduledEnd: form.get("scheduledEnd") || null,
      estimatedCost: form.get("estimatedCost") || null,
    };

    try {
      const response = await fetch("/api/work-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunde inte skapa arbetsordern");
      router.push(`/dashboard/arbetsorder/${data.workOrder.id}`);
      router.refresh();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte skapa arbetsordern");
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Panel title="Ny arbetsorder" description="Skapa ett tekniskt uppdrag direkt mot den här komponenten.">
        <button type="button" onClick={() => setOpen(true)} className={premiumPrimaryButtonClass}>
          <ClipboardPlus className="h-4 w-4" /> Skapa arbetsorder
        </button>
      </Panel>
    );
  }

  const locationText = [props.componentCategory, props.componentLocation].filter(Boolean).join(" · ");
  return (
    <Panel title="Skapa arbetsorder från komponent" description={`${props.componentName}${locationText ? ` · ${locationText}` : ""}`}>
      <form onSubmit={submit} className="space-y-5">
        {error ? <InlineAlert>{error}</InlineAlert> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">Rubrik *</span><input name="title" required maxLength={180} defaultValue={`Åtgärd – ${props.componentName}`} className={premiumFieldClass} /></label>
          <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">Beskrivning *</span><textarea name="description" required maxLength={10000} rows={4} defaultValue={`Beskriv behov, felbild och önskat resultat för ${props.componentName}.`} className={premiumFieldClass} /></label>
          <label><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">Arbetstyp</span><select name="workType" defaultValue="corrective" className={premiumFieldClass}><option value="corrective">Avhjälpande</option><option value="preventive">Förebyggande</option><option value="inspection">Besiktning</option><option value="emergency">Akut</option><option value="warranty">Garanti</option><option value="project">Projekt</option></select></label>
          <label><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">Prioritet</span><select name="priority" defaultValue={priorityByCriticality[props.criticality] || "normal"} className={premiumFieldClass}><option value="low">Låg</option><option value="normal">Normal</option><option value="high">Hög</option><option value="urgent">Akut</option></select></label>
          <label><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">Planerad start</span><input name="scheduledStart" type="date" className={premiumFieldClass} /></label>
          <label><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">Planerat slut</span><input name="scheduledEnd" type="date" className={premiumFieldClass} /></label>
          <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">Beräknad kostnad, SEK</span><input name="estimatedCost" type="number" min="0" step="0.01" className={premiumFieldClass} /></label>
        </div>
        <div className="flex flex-col-reverse gap-3 border-t border-sand-100 pt-5 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => { setOpen(false); setError(""); }} disabled={saving} className="rounded-xl border border-sand-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-sand-50 disabled:opacity-50">Avbryt</button>
          <button type="submit" disabled={saving} className={premiumPrimaryButtonClass}>{saving ? "Skapar…" : "Skapa och öppna arbetsorder"}</button>
        </div>
      </form>
    </Panel>
  );
}
