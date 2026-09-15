"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { readResponseJson } from "@/lib/fetch-json";
import { premiumFieldClass, premiumPrimaryButtonClass } from "@/components/dashboard/premium-ui";

type TechnicianNextOrderTimeFormProps = {
  workOrderId: string;
};

export function TechnicianNextOrderTimeForm({ workOrderId }: TechnicianNextOrderTimeFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const description = String(data.get("description") || "").trim();
    const minutes = String(data.get("minutes") || "").trim();
    if (!description || !minutes) return;

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/work-orders/${workOrderId}/execution`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "entry.create",
          entryType: "time",
          description,
          minutes,
        }),
      });
      const body = await readResponseJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(body.error || "Kunde inte registrera arbetstid");
      form.reset();
      setSuccess("Arbetstiden är registrerad.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kunde inte registrera arbetstid");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-5 space-y-3 rounded-2xl border border-sand-200 bg-white p-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-500">Registrera tid</p>
        <p className="mt-1 text-sm text-ink-600">Samma fältpost som på arbetsordern. Avslut och efterbilder görs där.</p>
      </div>
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold text-ink-600">Vad gjordes</span>
        <input
          name="description"
          required
          maxLength={500}
          placeholder="Felsökning, byte, åtgärd…"
          aria-label="Beskrivning av arbetstid"
          disabled={saving}
          className={premiumFieldClass}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold text-ink-600">Minuter</span>
        <input
          name="minutes"
          type="number"
          min={1}
          required
          placeholder="30"
          aria-label="Arbetstid i minuter"
          disabled={saving}
          className={premiumFieldClass}
        />
      </label>
      <button type="submit" disabled={saving} className={`${premiumPrimaryButtonClass} h-11 w-full disabled:opacity-60`}>
        {saving ? "Sparar…" : "Registrera tid"}
      </button>
      {success ? <p className="text-xs font-medium text-success-700">{success}</p> : null}
      {error ? <p className="text-xs font-medium text-danger-700">{error}</p> : null}
    </form>
  );
}
