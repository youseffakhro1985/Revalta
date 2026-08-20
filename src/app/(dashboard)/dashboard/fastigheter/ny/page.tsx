"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowLeft, Building2, CheckCircle2, MapPin } from "lucide-react";
import { readResponseJson } from "@/lib/fetch-json";

const fieldClass = "h-11 w-full rounded-xl border border-sand-200 bg-[#FCFBF8] px-3.5 text-sm text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-petroleum-300 focus:ring-2 focus:ring-petroleum-100";

type CreatePropertyResponse = {
  property?: { id: string };
  error?: string;
};

export default function NewPropertyPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", address: "", postalCode: "", city: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await readResponseJson<CreatePropertyResponse>(response);
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok || !body.property?.id) throw new Error(body.error || "Kunde inte skapa fastigheten");
      router.push(`/dashboard/fastigheter/${body.property.id}`);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Kunde inte kontakta servern");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex items-center gap-2 text-[11px] font-medium text-ink-500">
        <Link href="/dashboard/fastigheter" className="inline-flex items-center gap-1.5 transition hover:text-petroleum-800"><ArrowLeft className="h-3.5 w-3.5" /> Fastigheter</Link>
        <span>/</span>
        <span>Ny fastighet</span>
      </div>

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-petroleum-700">Portfölj / Fastigheter</p>
        <h1 className="mt-1 font-display text-[30px] font-semibold tracking-[-0.045em] text-ink-950 sm:text-[34px]">Ny fastighet</h1>
        <p className="mt-1 text-sm text-ink-500">Registrera grunduppgifterna. När fastigheten är skapad öppnas fastighetskortet direkt.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_310px]">
        <section className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm sm:p-6">
          <form onSubmit={submit} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Fastighetsnamn" description="Det namn som används i Revalta.">
                <input required minLength={2} maxLength={160} className={fieldClass} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Ex. Kvarnen 7" />
              </Field>
              <Field label="Ort" description="Ort där fastigheten är belägen.">
                <input required minLength={2} maxLength={120} className={fieldClass} value={form.city} onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))} placeholder="Göteborg" />
              </Field>
            </div>

            <Field label="Adress" description="Fastighetens huvudadress.">
              <input required minLength={3} maxLength={240} className={fieldClass} value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} placeholder="Ex. Kvarngatan 7" />
            </Field>

            <div className="max-w-xs">
              <Field label="Postnummer" description="Valfritt vid första registreringen.">
                <input maxLength={32} className={fieldClass} value={form.postalCode} onChange={(event) => setForm((current) => ({ ...current, postalCode: event.target.value }))} placeholder="411 10" />
              </Field>
            </div>

            {error ? <div className="rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700" role="status">{error}</div> : null}

            <div className="flex flex-col-reverse gap-2 border-t border-sand-100 pt-5 sm:flex-row sm:justify-end">
              <Link href="/dashboard/fastigheter" className="inline-flex h-10 items-center justify-center rounded-xl border border-sand-200 bg-white px-4 text-[12px] font-semibold text-ink-600 transition hover:bg-sand-50">Avbryt</Link>
              <button type="submit" disabled={submitting} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-petroleum-900 px-5 text-[12px] font-semibold text-white shadow-premium-sm transition hover:bg-petroleum-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-300 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">
                <Building2 className="h-4 w-4" /> {submitting ? "Skapar fastighet…" : "Skapa fastighet"}
              </button>
            </div>
          </form>
        </section>

        <aside className="space-y-3">
          <section className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-petroleum-50 text-petroleum-700"><Building2 className="h-5 w-5" /></div>
            <h2 className="mt-4 text-sm font-semibold text-ink-900">Efter registreringen</h2>
            <div className="mt-3 space-y-3 text-[11px] leading-5 text-ink-550">
              <InfoRow icon={CheckCircle2}>Fastighetskortet skapas i organisationens säkra tenant.</InfoRow>
              <InfoRow icon={MapPin}>Byggnader, objekt och kontaktuppgifter kan fyllas på direkt.</InfoRow>
              <InfoRow icon={CheckCircle2}>Arbetsorder, ärenden, dokument och uthyrning kan sedan kopplas till fastigheten.</InfoRow>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Field({ label, description, children }: { label: string; description: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-[12px] font-semibold text-ink-750">{label}</span><span className="mt-0.5 block text-[10px] text-ink-450">{description}</span><span className="mt-2 block">{children}</span></label>;
}

function InfoRow({ icon: Icon, children }: { icon: typeof CheckCircle2; children: React.ReactNode }) {
  return <div className="flex gap-2.5"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-petroleum-600" /><p>{children}</p></div>;
}
