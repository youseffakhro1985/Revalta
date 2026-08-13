"use client";

import { Plus, Trash2 } from "lucide-react";
import { premiumFieldClass } from "@/components/dashboard/premium-ui";
import type { HandoverKeyRecord } from "@/lib/lease-handover";

export function HandoverKeyRegister({ keys, onChange, disabled = false }: { keys: HandoverKeyRecord[]; onChange: (keys: HandoverKeyRecord[]) => void; disabled?: boolean }) {
  function update(id: string, patch: Partial<HandoverKeyRecord>) {
    if (disabled) return;
    onChange(keys.map((item) => item.id === id ? { ...item, ...patch } : item));
  }
  return <section className="rounded-2xl border border-sand-200 p-5">
    <div className="flex items-center justify-between"><h3 className="font-semibold text-ink-900">Nyckelregister</h3>{!disabled ? <button type="button" onClick={() => onChange([...keys, { id: `${Date.now()}`, label: "", quantity: 1, handedOut: 0, returned: 0, note: "" }])} className="inline-flex items-center text-sm font-semibold text-petroleum-700"><Plus className="mr-1 h-4 w-4" />Nyckel</button> : null}</div>
    <div className="mt-4 space-y-3">{keys.length === 0 ? <p className="rounded-xl bg-sand-50 p-4 text-sm text-ink-500">Inga nyckelposter registrerade.</p> : keys.map((key) => <div key={key.id} className="rounded-xl border border-sand-200 p-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_80px_80px_80px_auto]">
        <input aria-label="Nyckelbeteckning" placeholder="Ex. Lägenhetsnyckel" className={premiumFieldClass} value={key.label} disabled={disabled} onChange={(event) => update(key.id, { label: event.target.value })} />
        <Count label="Totalt" value={key.quantity} disabled={disabled} onChange={(value) => update(key.id, { quantity: value })} />
        <Count label="Utlämnat" value={key.handedOut} disabled={disabled} onChange={(value) => update(key.id, { handedOut: value })} />
        <Count label="Åter" value={key.returned} disabled={disabled} onChange={(value) => update(key.id, { returned: value })} />
        {!disabled ? <button type="button" aria-label="Ta bort nyckelpost" onClick={() => onChange(keys.filter((item) => item.id !== key.id))} className="rounded-lg p-2 text-ink-400 hover:bg-red-50 hover:text-red-700"><Trash2 className="h-4 w-4" /></button> : <span />}
      </div>
      <input placeholder="Anteckning" aria-label="Anteckning" className={`${premiumFieldClass} mt-2`} value={key.note} disabled={disabled} onChange={(event) => update(key.id, { note: event.target.value })} />
    </div>)}</div>
  </section>;
}

function Count({ label, value, onChange, disabled = false }: { label: string; value: number; onChange: (value: number) => void; disabled?: boolean }) {
  return <input aria-label={label} type="number" min={0} max={1000} className={premiumFieldClass} value={value} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} />;
}
