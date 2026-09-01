"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { readResponseJson } from "@/lib/fetch-json";

type DemoResponse = {
  ok?: boolean;
  error?: string;
  errorCode?: string;
  requestId?: string;
};

const fieldClass = "mt-1.5 h-12 w-full rounded-xl border border-sand-300 bg-white px-3.5 text-sm text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-petroleum-400 focus:ring-2 focus:ring-petroleum-600/10";
const textareaClass = "mt-1.5 min-h-32 w-full resize-y rounded-xl border border-sand-300 bg-white px-3.5 py-3 text-sm text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-petroleum-400 focus:ring-2 focus:ring-petroleum-600/10";

export function DemoRequestForm() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    company: "",
    phone: "",
    role: "",
    portfolio: "",
    message: "",
    website: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState("");

  function update(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setRequestId("");
    setSuccess(false);

    try {
      const response = await fetch("/api/demo-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await readResponseJson<DemoResponse>(response);
      if (!response.ok) {
        setError(payload.error || "Demoförfrågan kunde inte skickas just nu.");
        setRequestId(payload.requestId || response.headers.get("x-request-id") || "");
        return;
      }

      setSuccess(true);
      setForm({
        name: "",
        email: "",
        company: "",
        phone: "",
        role: "",
        portfolio: "",
        message: "",
        website: "",
      });
    } catch {
      setError("Det gick inte att kontakta Revalta just nu. Försök igen.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-[24px] border border-sand-200 bg-white p-5 shadow-premium-lg sm:p-7 lg:p-8">
      <div className="mb-7">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-petroleum-700">Boka demo</p>
        <h2 className="mt-2 font-display text-2xl font-semibold tracking-[-0.035em] text-ink-950 sm:text-[28px]">Berätta kort om er förvaltning</h2>
        <p className="mt-2 text-sm leading-6 text-ink-500">Fyll i kontaktuppgifterna så kan Revalta följa upp er förfrågan. Fält märkta med * är obligatoriska.</p>
      </div>

      {success ? (
        <div role="status" aria-live="polite" className="mb-6 flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold">Tack — förfrågan är mottagen.</p>
            <p className="mt-1 text-xs leading-5 text-emerald-800">Dina uppgifter har skickats till Revaltas kontaktkanal.</p>
          </div>
        </div>
      ) : null}

      {error ? (
        <div role="alert" aria-live="assertive" className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-semibold">{error}</p>
          {requestId ? <p className="mt-1 text-xs text-red-700">Referens: {requestId}</p> : null}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-ink-700">
          Namn *
          <input required autoComplete="name" maxLength={120} value={form.name} onChange={(event) => update("name", event.target.value)} className={fieldClass} placeholder="För- och efternamn" />
        </label>
        <label className="block text-xs font-semibold text-ink-700">
          E-post *
          <input required type="email" autoComplete="email" maxLength={254} value={form.email} onChange={(event) => update("email", event.target.value)} className={fieldClass} placeholder="namn@foretag.se" />
        </label>
        <label className="block text-xs font-semibold text-ink-700">
          Företag / organisation *
          <input required autoComplete="organization" maxLength={160} value={form.company} onChange={(event) => update("company", event.target.value)} className={fieldClass} placeholder="Företagsnamn" />
        </label>
        <label className="block text-xs font-semibold text-ink-700">
          Telefon
          <input type="tel" autoComplete="tel" maxLength={50} value={form.phone} onChange={(event) => update("phone", event.target.value)} className={fieldClass} placeholder="070-000 00 00" />
        </label>
        <label className="block text-xs font-semibold text-ink-700">
          Roll
          <input maxLength={120} value={form.role} onChange={(event) => update("role", event.target.value)} className={fieldClass} placeholder="T.ex. fastighetschef" />
        </label>
        <label className="block text-xs font-semibold text-ink-700">
          Bestånd / omfattning
          <input maxLength={160} value={form.portfolio} onChange={(event) => update("portfolio", event.target.value)} className={fieldClass} placeholder="T.ex. 25 fastigheter" />
        </label>
      </div>

      <label className="mt-4 block text-xs font-semibold text-ink-700">
        Vad vill ni se i Revalta?
        <textarea maxLength={2000} value={form.message} onChange={(event) => update("message", event.target.value)} className={textareaClass} placeholder="Exempel: felanmälan, arbetsorder, planerat underhåll, ekonomi eller boendeportal." />
      </label>

      <div className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
        <label>
          Webbplats
          <input tabIndex={-1} autoComplete="off" value={form.website} onChange={(event) => update("website", event.target.value)} name="website" />
        </label>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-md text-[11px] leading-5 text-ink-500">Genom att skicka formuläret godkänner du att uppgifterna behandlas för att hantera din förfrågan. Läs mer i Revaltas integritetspolicy.</p>
        <button type="submit" disabled={submitting} className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-petroleum-700 px-5 text-sm font-semibold text-white shadow-premium-sm transition hover:bg-petroleum-800 disabled:cursor-not-allowed disabled:opacity-60">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ArrowRight className="h-4 w-4" aria-hidden="true" />}
          {submitting ? "Skickar…" : "Skicka demoförfrågan"}
        </button>
      </div>
    </form>
  );
}
