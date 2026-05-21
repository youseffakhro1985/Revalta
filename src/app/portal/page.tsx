"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";

type Property = {
  id: string;
  name: string;
  address: string;
  postal_code: string | null;
  city: string;
  company?: { name: string };
};

type PublicTicket = {
  public_reference: string;
  title: string;
  status: string;
  priority: string;
  category: string;
  created_at: string;
  updated_at: string;
  ai_summary: string | null;
  property: {
    name: string;
    address: string;
    city: string;
  } | null;
  comments: Array<{
    id: string;
    body: string;
    created_at: string;
    user: { name: string | null };
  }>;
};

const statusLabels: Record<string, string> = {
  new: "Ny",
  received: "Mottagen",
  in_progress: "Pågår",
  waiting: "Väntar",
  completed: "Klar",
  closed: "Stängd",
};

const priorityLabels: Record<string, string> = {
  low: "Låg",
  normal: "Normal",
  high: "Hög",
  urgent: "Akut",
};

const dateFormatter = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default function PortalPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [companyName, setCompanyName] = useState("Revalta");
  const [reporterName, setReporterName] = useState("");
  const [reporterEmail, setReporterEmail] = useState("");
  const [reporterPhone, setReporterPhone] = useState("");
  const [reporterUnit, setReporterUnit] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [trackEmail, setTrackEmail] = useState("");
  const [trackedTicket, setTrackedTicket] = useState<PublicTicket | null>(null);
  const [createdReference, setCreatedReference] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadProperties() {
      const response = await fetch("/api/public/properties", { cache: "no-store" });
      const data = await response.json();
      if (response.ok) {
        setProperties(data.properties || []);
        setCompanyName(data.company?.name || "Revalta");
      }
    }

    loadProperties();
  }, []);

  async function createTicket(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setCreatedReference("");
    setLoading(true);

    try {
      const response = await fetch("/api/public/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reporterName, reporterEmail, reporterPhone, reporterUnit, propertyId, title, description }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Kunde inte skapa ärendet");
        return;
      }

      setCreatedReference(data.ticket.public_reference);
      setReference(data.ticket.public_reference);
      setTrackEmail(reporterEmail);
      setReporterName("");
      setReporterEmail("");
      setReporterPhone("");
      setReporterUnit("");
      setPropertyId("");
      setTitle("");
      setDescription("");
      setSuccess("Tack! Ärendet är mottaget och skickat till förvaltningen.");
    } catch {
      setError("Kunde inte kontakta servern");
    } finally {
      setLoading(false);
    }
  }

  async function trackTicket(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setTrackedTicket(null);
    setLoading(true);

    try {
      const normalizedReference = reference.trim().toUpperCase();
      const response = await fetch(`/api/public/tickets/${encodeURIComponent(normalizedReference)}?email=${encodeURIComponent(trackEmail)}`, { cache: "no-store" });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Kunde inte hitta ärendet");
        return;
      }

      setTrackedTicket(data.ticket);
      setSuccess("Ärendet hittades.");
    } catch {
      setError("Kunde inte kontakta servern");
    } finally {
      setLoading(false);
    }
  }

  async function uploadAttachment(event: React.FormEvent) {
    event.preventDefault();
    if (!attachmentFile || !reference || !trackEmail) return;
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", attachmentFile);
      formData.append("email", trackEmail);
      const response = await fetch(`/api/public/tickets/${encodeURIComponent(reference.trim().toUpperCase())}/attachments`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Kunde inte ladda upp bilagan");
        return;
      }
      setAttachmentFile(null);
      setSuccess("Bilagan är mottagen och kopplad till ärendet.");
    } catch {
      setError("Kunde inte kontakta servern");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <Link href="/" className="text-2xl font-extrabold tracking-tight text-white">Revalta</Link>
        <Link href="/login" className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/20">
          Förvaltare
        </Link>
      </div>

      <section className="mx-auto max-w-7xl px-6 pb-16 pt-10">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div className="space-y-8">
            <div>
              <p className="mb-4 text-sm font-semibold uppercase tracking-[0.25em] text-brand-200">Boendeportal</p>
              <h1 className="text-5xl font-extrabold leading-tight tracking-tight sm:text-6xl">
                Felanmälan som känns trygg, snabb och professionell.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
                Skicka in ett ärende till {companyName}. Du får ett referensnummer direkt och kan följa status utan konto.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {["Mottaget direkt", "Spårbart ärende", "Tydlig återkoppling"].map((item) => (
                <div key={item} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                  <p className="font-bold text-white">{item}</p>
                  <p className="mt-2 text-sm text-slate-400">Byggt för modern fastighetsservice.</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-5">
            {(error || success) && (
              <div className={`rounded-2xl border p-4 text-sm font-semibold ${error ? "border-red-400/30 bg-red-500/10 text-red-100" : "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"}`}>
                {error || success}
              </div>
            )}

            {createdReference && (
              <div className="rounded-3xl border border-brand-300/30 bg-brand-500/10 p-6">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-100">Ditt referensnummer</p>
                <p className="mt-3 text-4xl font-extrabold text-white">{createdReference}</p>
                <p className="mt-2 text-sm text-slate-300">Spara detta nummer. Du behöver det för att följa ärendet.</p>
              </div>
            )}

            <div className="rounded-3xl border border-white/10 bg-white p-6 text-slate-950 shadow-2xl">
              <h2 className="text-2xl font-extrabold">Skapa felanmälan</h2>
              <form onSubmit={createTicket} className="mt-6 space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <input required value={reporterName} onChange={(event) => setReporterName(event.target.value)} className="rounded-xl border border-slate-200 p-3" placeholder="Ditt namn" />
                  <input required type="email" value={reporterEmail} onChange={(event) => setReporterEmail(event.target.value)} className="rounded-xl border border-slate-200 p-3" placeholder="E-post" />
                  <input value={reporterPhone} onChange={(event) => setReporterPhone(event.target.value)} className="rounded-xl border border-slate-200 p-3" placeholder="Telefon" />
                  <input value={reporterUnit} onChange={(event) => setReporterUnit(event.target.value)} className="rounded-xl border border-slate-200 p-3" placeholder="Lägenhet/lokal" />
                </div>
                <select value={propertyId} onChange={(event) => setPropertyId(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white p-3">
                  <option value="">Välj fastighet om den finns i listan</option>
                  {properties.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.name} - {property.address}, {property.city}
                      {property.company?.name ? ` (${property.company.name})` : ""}
                    </option>
                  ))}
                </select>
                <input required minLength={3} value={title} onChange={(event) => setTitle(event.target.value)} className="w-full rounded-xl border border-slate-200 p-3" placeholder="Rubrik, t.ex. Trasig portlampa" />
                <textarea required minLength={10} rows={5} value={description} onChange={(event) => setDescription(event.target.value)} className="w-full rounded-xl border border-slate-200 p-3" placeholder="Beskriv felet tydligt..." />
                <button disabled={loading} className="w-full rounded-xl bg-brand-600 px-6 py-3 font-bold text-white transition-colors hover:bg-brand-700 disabled:opacity-70">
                  {loading ? "Skickar..." : "Skicka felanmälan"}
                </button>
              </form>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/10 p-6">
              <h2 className="text-2xl font-extrabold">Följ ditt ärende</h2>
              <form onSubmit={trackTicket} className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]">
                <input required value={reference} onChange={(event) => setReference(event.target.value)} className="rounded-xl border border-white/10 bg-white p-3 text-slate-950" placeholder="RV-2026-XXXXXX" />
                <input required type="email" value={trackEmail} onChange={(event) => setTrackEmail(event.target.value)} className="rounded-xl border border-white/10 bg-white p-3 text-slate-950" placeholder="Din e-post" />
                <button disabled={loading} className="rounded-xl bg-white px-5 py-3 font-bold text-slate-950 transition-colors hover:bg-slate-100 disabled:opacity-70">
                  Följ
                </button>
              </form>
              {trackedTicket && (
                <div className="mt-5 rounded-2xl bg-white p-5 text-slate-950">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-brand-600">{trackedTicket.public_reference}</p>
                      <h3 className="mt-2 text-xl font-extrabold">{trackedTicket.title}</h3>
                      <p className="mt-2 text-sm text-slate-500">
                        {trackedTicket.property ? `${trackedTicket.property.name} · ` : ""}
                        Skapad {dateFormatter.format(new Date(trackedTicket.created_at))}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <span className="rounded-full bg-warning-50 px-3 py-1 text-xs font-bold text-warning-600">{statusLabels[trackedTicket.status] || trackedTicket.status}</span>
                      <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-600">{priorityLabels[trackedTicket.priority] || trackedTicket.priority}</span>
                    </div>
                  </div>
                  {trackedTicket.ai_summary && <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">{trackedTicket.ai_summary}</p>}
                  {trackedTicket.comments.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {trackedTicket.comments.map((comment) => (
                        <div key={comment.id} className="rounded-xl border border-slate-100 p-3 text-sm text-slate-600">
                          {comment.body}
                        </div>
                      ))}
                    </div>
                  )}
                  <form onSubmit={uploadAttachment} className="mt-5 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <p className="font-bold text-slate-950">Lägg till bilaga</p>
                    <p className="mt-1 text-sm text-slate-500">PNG, JPG, WebP, PDF eller TXT upp till 1 MB.</p>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,application/pdf,text/plain"
                      onChange={(event) => setAttachmentFile(event.target.files?.[0] || null)}
                      className="mt-3 block w-full rounded-xl border border-slate-200 bg-white p-3 text-sm"
                    />
                    <button disabled={loading || !attachmentFile} className="mt-3 rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white disabled:opacity-70">
                      Ladda upp bilaga
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
    <SiteFooter />
    </>
  );
}
