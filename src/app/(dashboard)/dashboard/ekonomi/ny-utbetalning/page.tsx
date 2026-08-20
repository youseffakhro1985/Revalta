"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, CircleDollarSign, Save } from "lucide-react";
import { readResponseJson } from "@/lib/fetch-json";

type BudgetResponse = {
  properties?: Array<{ id: string; name: string }>;
  permissions?: { canManage?: boolean };
  error?: string;
};

type ApiResponse = { error?: string };

const categories = [
  ["operations", "Drift"],
  ["maintenance", "Underhåll"],
  ["energy", "Energi"],
  ["administration", "Administration"],
  ["finance", "Finans"],
  ["investment", "Investering"],
  ["other", "Övrigt"],
] as const;

export default function NewPayoutPage() {
  const router = useRouter();
  const [properties, setProperties] = useState<Array<{ id: string; name: string }>>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    propertyId: "",
    category: "operations",
    account: "",
    amount: "",
    note: "",
  });

  useEffect(() => {
    let active = true;
    async function load() {
      const response = await fetch("/api/budget", { cache: "no-store" });
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      const data = await readResponseJson<BudgetResponse>(response);
      if (!active) return;
      if (!response.ok) setError(data.error || "Kunde inte hämta ekonomidata");
      else {
        setProperties(data.properties || []);
        setCanManage(Boolean(data.permissions?.canManage));
      }
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [router]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const amount = Number(form.amount);
    if (!form.propertyId || !form.account.trim() || !Number.isFinite(amount) || amount <= 0) {
      setError("Fastighet, mottagare/beskrivning och ett positivt belopp krävs.");
      return;
    }
    setSaving(true);
    const response = await fetch("/api/budget", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        propertyId: form.propertyId,
        year: new Date().getFullYear(),
        category: form.category,
        account: form.account.trim(),
        budget: 0,
        forecast: 0,
        actual: amount,
        note: ["Registrerad via Ekonomi → Ny utbetalning", form.note.trim()].filter(Boolean).join(" · "),
      }),
    });
    const data = await readResponseJson<ApiResponse>(response);
    if (!response.ok) {
      setError(data.error || "Kunde inte registrera utbetalningen");
      setSaving(false);
      return;
    }
    router.push("/dashboard/ekonomi");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/dashboard/ekonomi" className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-petroleum-700 hover:text-petroleum-900"><ArrowLeft className="h-3.5 w-3.5" /> Tillbaka till Ekonomi</Link>

      <header>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-petroleum-700">Ekonomi / Utbetalning</p>
        <h1 className="mt-1 font-display text-[30px] font-semibold tracking-[-0.045em] text-ink-950">Ny utbetalning</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-500">Registrera ett verkligt ekonomiskt utfall på rätt fastighet och kostnadsslag. Posten går direkt in i Revaltas befintliga budget- och utfallsdata.</p>
      </header>

      {error ? <div className="rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700" role="alert">{error}</div> : null}
      {!loading && !canManage ? <div className="rounded-xl border border-sand-200 bg-sand-50 px-4 py-3 text-sm text-ink-600">Du har läsbehörighet men saknar behörighet att registrera ekonomiskt utfall.</div> : null}

      <section className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-premium-sm">
        <div className="flex items-center gap-3 border-b border-sand-100 px-5 py-4 sm:px-6">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sand-50 text-petroleum-800"><CircleDollarSign className="h-[18px] w-[18px]" /></span>
          <div><h2 className="text-sm font-semibold text-ink-900">Utbetalningsuppgifter</h2><p className="mt-0.5 text-[10px] text-ink-450">Belopp lagras som registrerat utfall för innevarande år.</p></div>
        </div>

        <form onSubmit={submit} className="space-y-5 p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Fastighet">
              <select required disabled={loading || !canManage} value={form.propertyId} onChange={(event) => setForm((current) => ({ ...current, propertyId: event.target.value }))} className={fieldClass}>
                <option value="">Välj fastighet</option>
                {properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
              </select>
            </Field>
            <Field label="Kostnadsslag">
              <select disabled={!canManage} value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} className={fieldClass}>
                {categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Mottagare / konto / beskrivning">
            <input required disabled={!canManage} value={form.account} onChange={(event) => setForm((current) => ({ ...current, account: event.target.value }))} placeholder="Exempel: Elavtal, serviceleverantör eller konto 5010" className={fieldClass} />
          </Field>

          <Field label="Belopp (SEK)">
            <input required disabled={!canManage} type="number" min="0.01" step="0.01" inputMode="decimal" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} placeholder="0" className={fieldClass} />
          </Field>

          <Field label="Anteckning" optional>
            <textarea disabled={!canManage} rows={4} value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} placeholder="Referens, fakturanummer eller intern kommentar" className={`${fieldClass} h-auto py-3`} />
          </Field>

          <div className="flex flex-col-reverse gap-2 border-t border-sand-100 pt-5 sm:flex-row sm:justify-end">
            <Link href="/dashboard/ekonomi" className="inline-flex h-11 items-center justify-center rounded-xl border border-sand-200 bg-white px-4 text-[11px] font-semibold text-ink-600 transition hover:bg-sand-50">Avbryt</Link>
            <button type="submit" disabled={saving || loading || !canManage} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-petroleum-900 px-5 text-[11px] font-semibold text-white shadow-premium-sm transition hover:bg-petroleum-800 disabled:cursor-not-allowed disabled:opacity-50"><Save className="h-4 w-4" /> {saving ? "Registrerar…" : "Registrera utbetalning"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

const fieldClass = "h-11 w-full rounded-xl border border-sand-200 bg-[#FCFBF8] px-3.5 text-[12px] text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-petroleum-300 focus:ring-2 focus:ring-petroleum-100 disabled:cursor-not-allowed disabled:opacity-55";

function Field({ label, optional = false, children }: { label: string; optional?: boolean; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold text-ink-650">{label}{optional ? <span className="font-normal text-ink-400">(valfritt)</span> : null}</span>{children}</label>;
}
