"use client";

import { useState } from "react";
import { ArrowUpRight, CheckCircle2 } from "lucide-react";
import { readResponseJson } from "@/lib/fetch-json";

const fieldClass = "h-11 w-full rounded-xl border border-sand-300 bg-white px-3.5 text-sm text-ink-900 outline-none transition placeholder:text-ink-300 focus:border-petroleum-400 focus:ring-2 focus:ring-petroleum-100";

const initialForm = {
  name: "",
  email: "",
  company: "",
  phone: "",
  role: "",
  portfolio: "",
  message: "",
  website: "",
};

export function DemoRequestForm() {
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  function update(field: keyof typeof initialForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/demo-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await readResponseJson<{ error?: string; message?: string }>(response);
      if (!response.ok) {
        setError(body.error || "Kunde inte skicka demoförfrågan. Försök igen senare.");
        return;
      }
      setSuccess(true);
      setForm(initialForm);
    } catch {
      setError("Kunde inte kontakta Revalta. Försök igen senare.");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="rounded-2xl border border-petroleum-200 bg-petroleum-50/70 p-7" role="status">
        <CheckCircle2 className="h-6 w-6 text-petroleum-700" aria-hidden="true" />
        <h2 className="mt-4 text-xl font-semibold tracking-[-0.02em] text-ink-950">Tack för din förfrågan</h2>
        <p className="mt-2 text-sm leading-6 text-ink-600">Vi har tagit emot din demoförfrågan och återkommer för att hitta ett upplägg som passar er.</p>
        <button type="button" onClick={() => setSuccess(false)} className="mt-5 text-sm font-semibold text-petroleum-700 underline-offset-4 hover:underline">
          Skicka en ny förfrågan
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Namn" htmlFor="demo-name" required>
          <input id="demo-name" autoComplete="name" required minLength={2} maxLength={100} value={form.name} onChange={(event) => update("name", event.target.value)} className={fieldClass} />
        </Field>
        <Field label="E-post" htmlFor="demo-email" required>
          <input id="demo-email" type="email" autoComplete="email" required maxLength={254} value={form.email} onChange={(event) => update("email", event.target.value)} className={fieldClass} />
        </Field>
        <Field label="Företag / organisation" htmlFor="demo-company" required>
          <input id="demo-company" autoComplete="organization" required minLength={2} maxLength={120} value={form.company} onChange={(event) => update("company", event.target.value)} className={fieldClass} />
        </Field>
        <Field label="Telefon" htmlFor="demo-phone">
          <input id="demo-phone" type="tel" autoComplete="tel" maxLength={40} value={form.phone} onChange={(event) => update("phone", event.target.value)} className={fieldClass} />
        </Field>
        <Field label="Din roll" htmlFor="demo-role">
          <select id="demo-role" value={form.role} onChange={(event) => update("role", event.target.value)} className={fieldClass}>
            <option value="">Välj om du vill</option>
            <option value="Fastighetsägare">Fastighetsägare</option>
            <option value="Förvaltare">Förvaltare</option>
            <option value="BRF / styrelse">BRF / styrelse</option>
            <option value="Teknisk förvaltning">Teknisk förvaltning</option>
            <option value="Ekonomi / administration">Ekonomi / administration</option>
            <option value="Annat">Annat</option>
          </select>
        </Field>
        <Field label="Bestånd" htmlFor="demo-portfolio">
          <input id="demo-portfolio" maxLength={80} placeholder="Ex. 12 fastigheter eller 350 lägenheter" value={form.portfolio} onChange={(event) => update("portfolio", event.target.value)} className={fieldClass} />
        </Field>
      </div>

      <Field label="Vad vill ni få ut av en demo?" htmlFor="demo-message">
        <textarea id="demo-message" rows={5} maxLength={1500} value={form.message} onChange={(event) => update("message", event.target.value)} className="w-full resize-y rounded-xl border border-sand-300 bg-white px-3.5 py-3 text-sm leading-6 text-ink-900 outline-none transition placeholder:text-ink-300 focus:border-petroleum-400 focus:ring-2 focus:ring-petroleum-100" placeholder="Berätta gärna kort om ert arbetssätt, vilka moduler ni vill se eller vad ni vill förbättra." />
      </Field>

      <div className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
        <label htmlFor="demo-website">Webbplats</label>
        <input id="demo-website" tabIndex={-1} autoComplete="off" value={form.website} onChange={(event) => update("website", event.target.value)} />
      </div>

      {error ? <p className="rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm font-medium text-danger-700" role="alert">{error}</p> : null}

      <div className="flex flex-col gap-3 border-t border-sand-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-md text-xs leading-5 text-ink-500">Genom att skicka formuläret använder Revalta uppgifterna för att hantera din förfrågan. Läs mer i vår integritetspolicy.</p>
        <button disabled={submitting} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-petroleum-700 px-5 text-sm font-semibold text-white shadow-premium-sm transition hover:bg-petroleum-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-300 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">
          {submitting ? "Skickar…" : "Skicka demoförfrågan"}
          {!submitting ? <ArrowUpRight className="h-4 w-4" aria-hidden="true" /> : null}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  required = false,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold text-ink-700">
        {label}{required ? <span className="ml-1 text-petroleum-700" aria-hidden="true">*</span> : null}
      </label>
      {children}
    </div>
  );
}
