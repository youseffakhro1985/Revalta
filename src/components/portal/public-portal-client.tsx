"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { PRIORITY_LABELS, TICKET_STATUS_LABELS } from "@/lib/domain-labels";
import { readResponseJson } from "@/lib/fetch-json";
import type { PublicTrackedTicket } from "@/lib/public-ticket-track";

function withCompanySlug(path: string, companySlug?: string) {
  if (!companySlug) return path;
  const url = new URL(path, "https://revalta.local");
  url.searchParams.set("companySlug", companySlug);
  return `${url.pathname}${url.search}`;
}

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
    author?: { type: string; name: string };
    user?: { name: string | null };
  }>;
  residentFeedback?: {
    rating: number;
    comment: string | null;
    submittedAt: string;
  } | null;
};

const statusLabels = TICKET_STATUS_LABELS;
const priorityLabels = PRIORITY_LABELS;

const dateFormatter = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "medium",
  timeStyle: "short",
});

function portalReasonCopy(reason?: string | null) {
  if (reason === "invalid") return "Kontrollera namn, e-post, fastighet, rubrik och beskrivning.";
  if (reason === "rate") return "För många försök. Vänta en stund och prova igen.";
  if (reason === "unavailable") return "Boendeportalen är inte tillgänglig just nu.";
  if (reason === "error") return "Något gick fel. Försök igen.";
  return "";
}

const createdTicketCopy = "Tack! Ärendet är mottaget och skickat till förvaltningen.";
const commentedTicketCopy = "Kommentaren är skickad till förvaltningen.";

type PublicPortalClientProps = {
  companySlug?: string;
  initialCreated?: boolean;
  initialReference?: string;
  initialReason?: string;
  initialToken?: string;
  initialTrackEmail?: string;
  initialTrackedTicket?: PublicTrackedTicket | null;
  initialTrackError?: string;
  initialCommented?: boolean;
};

function asPublicTicket(ticket: PublicTrackedTicket): PublicTicket {
  return {
    ...ticket,
    public_reference: ticket.public_reference || "",
  };
}

export function PublicPortalClient({
  companySlug,
  initialCreated = false,
  initialReference = "",
  initialReason = "",
  initialToken = "",
  initialTrackEmail = "",
  initialTrackedTicket = null,
  initialTrackError = "",
  initialCommented = false,
}: PublicPortalClientProps) {
  const normalizedInitialReference = initialReference.trim().toUpperCase();
  const [properties, setProperties] = useState<Property[]>([]);
  const [companyName, setCompanyName] = useState("Revalta");
  const [reporterName, setReporterName] = useState("");
  const [reporterEmail, setReporterEmail] = useState("");
  const [reporterPhone, setReporterPhone] = useState("");
  const [reporterUnit, setReporterUnit] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState(normalizedInitialReference);
  const [trackEmail, setTrackEmail] = useState(initialTrackEmail);
  const [trackingToken, setTrackingToken] = useState(initialToken);
  const [trackedTicket, setTrackedTicket] = useState<PublicTicket | null>(
    initialTrackedTicket ? asPublicTicket(initialTrackedTicket) : null,
  );
  const [createdReference, setCreatedReference] = useState(
    initialCreated && normalizedInitialReference ? normalizedInitialReference : "",
  );
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [residentComment, setResidentComment] = useState("");
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [error, setError] = useState(() => initialTrackError || portalReasonCopy(initialReason));
  const [success, setSuccess] = useState(
    initialCreated && normalizedInitialReference
      ? createdTicketCopy
      : initialCommented
        ? commentedTicketCopy
        : initialTrackedTicket
          ? "Ärendet hittades."
          : "",
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadProperties() {
      const response = await fetch(withCompanySlug("/api/public/properties", companySlug), { cache: "no-store" });
      const data = await readResponseJson(response);
      if (response.ok) {
        setProperties(data.properties || []);
        setCompanyName(data.company?.name || "Revalta");
      } else {
        setError(data.error || "Boendeportalen är inte konfigurerad ännu");
      }
    }

    loadProperties();
  }, [companySlug]);

  async function loadTrackedTicket(nextReference: string, nextEmail: string, nextToken: string) {
    const normalizedReference = nextReference.trim().toUpperCase();
    const params = new URLSearchParams();
    if (nextEmail) params.set("email", nextEmail);
    if (nextToken) params.set("token", nextToken);
    const response = await fetch(`/api/public/tickets/${encodeURIComponent(normalizedReference)}?${params.toString()}`, { cache: "no-store" });
    const data = await readResponseJson(response);
    if (!response.ok) {
      throw new Error(data.error || "Kunde inte hitta ärendet");
    }
    if (typeof data.trackingToken === "string") setTrackingToken(data.trackingToken);
    setTrackedTicket(data.ticket);
    setReference(normalizedReference);
    return data.ticket as PublicTicket;
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const reason = params.get("reason");
    const reasonCopy = portalReasonCopy(reason);
    if (reasonCopy) setError(reasonCopy);

    const created = params.get("created") === "1";
    const commented = params.get("commented") === "1";
    const ref = params.get("ref")?.trim();
    const token = params.get("token")?.trim() || "";
    const email = params.get("email")?.trim() || "";
    if (created && ref) {
      setCreatedReference(ref.toUpperCase());
      setSuccess(createdTicketCopy);
    } else if (commented) {
      setSuccess(commentedTicketCopy);
    }
    if (!ref) return;
    setReference(ref.toUpperCase());
    if (token) setTrackingToken(token);
    if (email) setTrackEmail(email);
    if (initialTrackedTicket) return;
    void (async () => {
      if (!created && !commented) {
        setError("");
        setSuccess("");
      }
      setLoading(true);
      try {
        await loadTrackedTicket(ref, email, token);
        if (!created && !commented) setSuccess("Ärendet hittades.");
        if (params.get("feedback") === "1") {
          document.getElementById("boende-aterkoppling")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      } catch (loadError) {
        if (!created) {
          setError(loadError instanceof Error ? loadError.message : "Kunde inte hitta ärendet");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [initialTrackedTicket]);

  async function createTicket(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setCreatedReference("");
    setLoading(true);

    try {
      const response = await fetch(withCompanySlug("/api/public/tickets", companySlug), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reporterName, reporterEmail, reporterPhone, reporterUnit, propertyId, title, description, companySlug }),
      });
      const data = await readResponseJson(response);

      if (!response.ok) {
        setError(data.error || "Kunde inte skapa ärendet");
        return;
      }

      setCreatedReference(data.ticket.public_reference);
      setReference(data.ticket.public_reference);
      setTrackEmail(reporterEmail);
      if (typeof data.trackingToken === "string") setTrackingToken(data.trackingToken);
      setReporterName("");
      setReporterEmail("");
      setReporterPhone("");
      setReporterUnit("");
      setPropertyId("");
      setTitle("");
      setDescription("");
      setSuccess(createdTicketCopy);
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
      const dataTicket = await loadTrackedTicket(reference, trackEmail, trackingToken);
      setTrackedTicket(dataTicket);
      setSuccess("Ärendet hittades.");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Kunde inte kontakta servern");
    } finally {
      setLoading(false);
    }
  }

  async function uploadAttachment(event: React.FormEvent) {
    event.preventDefault();
    if (!attachmentFile || !reference || (!trackEmail && !trackingToken)) return;
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", attachmentFile);
      formData.append("email", trackEmail);
      if (trackingToken) formData.append("token", trackingToken);
      const response = await fetch(`/api/public/tickets/${encodeURIComponent(reference.trim().toUpperCase())}/attachments`, {
        method: "POST",
        body: formData,
      });
      const data = await readResponseJson(response);
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

  async function addResidentComment(event: React.FormEvent) {
    event.preventDefault();
    if (!reference || (!trackEmail && !trackingToken) || !residentComment.trim()) return;
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const response = await fetch(`/api/public/tickets/${encodeURIComponent(reference.trim().toUpperCase())}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trackEmail, body: residentComment, token: trackingToken || undefined }),
      });
      const data = await readResponseJson(response);
      if (!response.ok) {
        setError(data.error || "Kunde inte lägga till kommentaren");
        return;
      }
      setTrackedTicket((current) =>
        current ? { ...current, comments: [...current.comments, data.comment] } : current
      );
      setResidentComment("");
      setSuccess("Kommentaren är skickad till förvaltningen.");
    } catch {
      setError("Kunde inte kontakta servern");
    } finally {
      setLoading(false);
    }
  }

  async function submitResidentFeedback(event: React.FormEvent) {
    event.preventDefault();
    if (!reference || (!trackEmail && !trackingToken) || feedbackRating < 1) return;
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const response = await fetch(`/api/public/tickets/${encodeURIComponent(reference.trim().toUpperCase())}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trackEmail || undefined,
          token: trackingToken || undefined,
          rating: feedbackRating,
          comment: feedbackComment.trim() || undefined,
        }),
      });
      const data = await readResponseJson(response);
      if (!response.ok) {
        setError(data.error || "Kunde inte spara återkopplingen");
        if (data.feedback) {
          setTrackedTicket((current) => current ? { ...current, residentFeedback: data.feedback } : current);
        }
        return;
      }
      setTrackedTicket((current) => current ? { ...current, residentFeedback: data.feedback } : current);
      setFeedbackComment("");
      setSuccess("Tack för återkopplingen.");
    } catch {
      setError("Kunde inte kontakta servern");
    } finally {
      setLoading(false);
    }
  }

  const closedTicket = trackedTicket && ["closed", "completed"].includes(trackedTicket.status);

  return (
    <>
    <main className="min-h-screen bg-sand-50 text-ink-900 font-sans selection:bg-petroleum-100 selection:text-petroleum-900">
      
      {/* Navbar */}
      <header className="sticky top-0 z-50 bg-sand-50/80 backdrop-blur-md border-b border-sand-200/50">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <Link href="/" className="text-2xl font-semibold tracking-tighter text-petroleum-600">Revalta</Link>
          <Link href="/login" className="rounded-lg border border-sand-200 bg-white px-5 py-2.5 text-sm font-medium text-ink-800 transition-colors hover:bg-sand-100 shadow-sm">
            Förvaltare
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 pb-20 pt-16 lg:pt-24">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div className="space-y-10">
            <div className="animate-slide-up-soft">
              <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-petroleum-600">Boendeportal</p>
              <h1 className="text-5xl font-semibold leading-[1.1] tracking-tight text-ink-950 sm:text-6xl">
                Felanmälan som känns trygg och snabb.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-600">
                Skicka in ett ärende till {companyName}. Du får ett referensnummer direkt och kan följa status helt utan att behöva logga in.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 animate-slide-up-soft" style={{ animationDelay: "100ms" }}>
              {[
                { title: "Mottaget direkt", text: "Förvaltningen får ärendet så fort du skickar det." },
                { title: "Spårbart ärende", text: "Följ status med referens eller länken i e-posten." },
                { title: "Tydlig återkoppling", text: "När ärendet är klart kan du betygsätta hur det gick." },
              ].map((item) => (
                <div key={item.title} className="rounded-xl border border-sand-200 bg-white p-5 shadow-sm">
                  <p className="text-sm font-semibold text-ink-950">{item.title}</p>
                  <p className="mt-1 text-xs text-ink-500">{item.text}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6 animate-slide-up-soft" style={{ animationDelay: "200ms" }}>
            {(error || success) && (
              <div role={error ? "alert" : "status"} aria-live="polite" className={`rounded-xl border p-4 text-sm font-semibold shadow-sm ${error ? "border-danger-200 bg-danger-50 text-danger-700" : "border-success-200 bg-success-50 text-success-700"}`}>
                {error || success}
              </div>
            )}

            {createdReference && (
              <div className="rounded-2xl border border-petroleum-200 bg-petroleum-50 p-6 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-petroleum-700">Ditt referensnummer</p>
                <p className="mt-2 text-4xl font-semibold text-petroleum-900">{createdReference}</p>
                <p className="mt-2 text-sm text-petroleum-600">Spara detta nummer. Du behöver det för att följa ärendet.</p>
              </div>
            )}

            <div className="rounded-2xl border border-sand-200 bg-white p-6 sm:p-8 shadow-premium-lg">
              <h2 className="text-2xl font-semibold text-ink-950">Skapa felanmälan</h2>
              <form
                id="public-ticket-form"
                method="post"
                action={withCompanySlug("/api/public/tickets", companySlug)}
                onSubmit={createTicket}
                className="mt-6 space-y-4"
              >
                {companySlug ? <input type="hidden" name="companySlug" value={companySlug} /> : null}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label><span className="sr-only">Ditt namn</span><input required name="reporterName" autoComplete="name" maxLength={120} value={reporterName} onChange={(event) => setReporterName(event.target.value)} className="w-full rounded-xl border border-sand-200 p-3 text-sm focus:border-petroleum-500 focus:ring-1 focus:ring-petroleum-500 outline-none transition-all" placeholder="Ditt namn" /></label>
                  <label><span className="sr-only">E-post</span><input required name="reporterEmail" type="email" autoComplete="email" maxLength={254} value={reporterEmail} onChange={(event) => setReporterEmail(event.target.value)} className="w-full rounded-xl border border-sand-200 p-3 text-sm focus:border-petroleum-500 focus:ring-1 focus:ring-petroleum-500 outline-none transition-all" placeholder="E-post" /></label>
                  <label><span className="sr-only">Telefon</span><input name="reporterPhone" type="tel" autoComplete="tel" maxLength={40} value={reporterPhone} onChange={(event) => setReporterPhone(event.target.value)} className="w-full rounded-xl border border-sand-200 p-3 text-sm focus:border-petroleum-500 focus:ring-1 focus:ring-petroleum-500 outline-none transition-all" placeholder="Telefon" /></label>
                  <label><span className="sr-only">Lägenhet eller lokal</span><input name="reporterUnit" autoComplete="address-line2" maxLength={80} value={reporterUnit} onChange={(event) => setReporterUnit(event.target.value)} className="w-full rounded-xl border border-sand-200 p-3 text-sm focus:border-petroleum-500 focus:ring-1 focus:ring-petroleum-500 outline-none transition-all" placeholder="Lägenhet/lokal" /></label>
                </div>
                <label className="block"><span className="sr-only">Fastighet</span><select name="propertyId" value={propertyId} onChange={(event) => setPropertyId(event.target.value)} className="w-full rounded-xl border border-sand-200 bg-white p-3 text-sm focus:border-petroleum-500 focus:ring-1 focus:ring-petroleum-500 outline-none transition-all text-ink-900">
                  <option value="">Välj fastighet om den finns i listan</option>
                  {properties.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.name} - {property.address}, {property.city}
                      {property.company?.name ? ` (${property.company.name})` : ""}
                    </option>
                  ))}
                </select></label>
                <label className="block"><span className="sr-only">Ärendets rubrik</span><input required name="title" minLength={3} maxLength={180} value={title} onChange={(event) => setTitle(event.target.value)} className="w-full rounded-xl border border-sand-200 p-3 text-sm focus:border-petroleum-500 focus:ring-1 focus:ring-petroleum-500 outline-none transition-all" placeholder="Rubrik, t.ex. Trasig portlampa" /></label>
                <label className="block"><span className="sr-only">Beskriv felet</span><textarea required name="description" minLength={10} maxLength={5_000} rows={5} value={description} onChange={(event) => setDescription(event.target.value)} className="w-full rounded-xl border border-sand-200 p-3 text-sm focus:border-petroleum-500 focus:ring-1 focus:ring-petroleum-500 outline-none transition-all" placeholder="Beskriv felet tydligt..." /></label>
                <button type="submit" disabled={loading} className="w-full rounded-xl bg-petroleum-600 px-6 py-3.5 text-sm font-semibold text-white shadow-premium-sm transition-all hover:bg-petroleum-700 disabled:opacity-70 mt-2">
                  {loading ? "Skickar..." : "Skicka felanmälan"}
                </button>
              </form>
            </div>

            <div className="rounded-2xl border border-sand-200 bg-sand-50/50 p-6 sm:p-8">
              <h2 className="text-xl font-semibold text-ink-950">Följ ditt ärende</h2>
              <form
                id="public-track-form"
                method="get"
                action={companySlug ? `/portal/${encodeURIComponent(companySlug)}` : "/portal"}
                onSubmit={trackTicket}
                className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]"
              >
                {trackingToken ? <input type="hidden" name="token" value={trackingToken} /> : null}
                <label><span className="sr-only">Ärendets referensnummer</span><input required name="ref" autoComplete="off" maxLength={32} value={reference} onChange={(event) => setReference(event.target.value)} className="w-full rounded-xl border border-sand-200 bg-white p-3 text-sm text-ink-950 focus:border-petroleum-500 focus:ring-1 focus:ring-petroleum-500 outline-none" placeholder="RV-2026-XXXXXX" /></label>
                <label><span className="sr-only">E-post som användes för ärendet</span><input required={!trackingToken} name="email" type="email" autoComplete="email" maxLength={254} value={trackEmail} onChange={(event) => setTrackEmail(event.target.value)} className="w-full rounded-xl border border-sand-200 bg-white p-3 text-sm text-ink-950 focus:border-petroleum-500 focus:ring-1 focus:ring-petroleum-500 outline-none" placeholder="Din e-post" /></label>
                <button type="submit" disabled={loading} className="rounded-xl border border-sand-200 bg-white px-5 py-3 text-sm font-semibold text-ink-900 shadow-sm transition-colors hover:bg-sand-100 disabled:opacity-70">
                  Följ
                </button>
              </form>
              
              {trackedTicket && (
                <div className="mt-6 rounded-xl border border-sand-200 bg-white p-6 shadow-sm">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-petroleum-600">{trackedTicket.public_reference}</p>
                      <h3 className="mt-1.5 text-lg font-semibold text-ink-950">{trackedTicket.title}</h3>
                      <p className="mt-1 text-xs text-ink-500">
                        {trackedTicket.property ? `${trackedTicket.property.name} · ` : ""}
                        Skapad {dateFormatter.format(new Date(trackedTicket.created_at))}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <span className="rounded bg-sand-100 px-2 py-1 text-xs font-semibold text-ink-700 border border-sand-200">{statusLabels[trackedTicket.status] || trackedTicket.status}</span>
                      <span className="rounded bg-warning-50 px-2 py-1 text-xs font-semibold text-warning-700 border border-warning-200">{priorityLabels[trackedTicket.priority] || trackedTicket.priority}</span>
                    </div>
                  </div>
                  
                  {trackedTicket.ai_summary && (
                    <div className="mt-5 rounded-lg border border-petroleum-100 bg-petroleum-50/50 p-4">
                      <div className="flex items-center gap-1.5 mb-2">
                        <svg className="w-3.5 h-3.5 text-petroleum-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        <span className="text-xs font-semibold text-petroleum-700 uppercase">AI-sammanfattning</span>
                      </div>
                      <p className="text-sm text-ink-700 leading-relaxed">{trackedTicket.ai_summary}</p>
                    </div>
                  )}
                  
                  {trackedTicket.comments.length > 0 && (
                    <div className="mt-5 space-y-3">
                      <p className="text-xs font-semibold text-ink-900 uppercase tracking-wide">Uppdateringar</p>
                      {trackedTicket.comments.map((comment) => (
                        <div key={comment.id} className="rounded-lg border border-sand-100 bg-sand-50/50 p-3.5">
                           <p className="text-xs font-medium text-ink-950 mb-1">{comment.author?.name || comment.user?.name || "Förvaltningen"} <span className="text-xs text-ink-500 font-normal ml-2">{dateFormatter.format(new Date(comment.created_at))}</span></p>
                           <p className="text-sm text-ink-700">{comment.body}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {closedTicket ? (
                    <div id="boende-aterkoppling" className="mt-6 border-t border-sand-100 pt-5">
                      {trackedTicket.residentFeedback ? (
                        <div className="rounded-xl border border-petroleum-100 bg-petroleum-50 p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-petroleum-700">Din återkoppling</p>
                          <p className="mt-2 text-sm font-semibold text-ink-950">{trackedTicket.residentFeedback.rating} av 5</p>
                          {trackedTicket.residentFeedback.comment ? <p className="mt-2 text-sm text-ink-700">{trackedTicket.residentFeedback.comment}</p> : null}
                        </div>
                      ) : (
                        <form
                          id="public-feedback-form"
                          method="post"
                          action={`/api/public/tickets/${encodeURIComponent(reference.trim().toUpperCase())}/feedback`}
                          onSubmit={submitResidentFeedback}
                        >
                          {companySlug ? <input type="hidden" name="companySlug" value={companySlug} /> : null}
                          {trackingToken ? <input type="hidden" name="token" value={trackingToken} /> : null}
                          {trackEmail ? <input type="hidden" name="email" value={trackEmail} /> : null}
                          <p className="text-sm font-semibold text-ink-900">Hur gick det?</p>
                          <p className="mt-1 text-xs text-ink-500">Betygsätt ärendet när det är avslutat. En gång per ärende.</p>
                          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Betyg 1 till 5">
                            {[1, 2, 3, 4, 5].map((value) => (
                              <label
                                key={value}
                                className={`grid h-10 w-10 cursor-pointer place-items-center rounded-xl border text-sm font-semibold ${feedbackRating === value ? "border-petroleum-600 bg-petroleum-600 text-white" : "border-sand-200 bg-white text-ink-800 hover:bg-sand-50"}`}
                              >
                                <input
                                  type="radio"
                                  name="rating"
                                  value={value}
                                  checked={feedbackRating === value}
                                  onChange={() => setFeedbackRating(value)}
                                  className="sr-only"
                                  aria-label={`${value} av 5`}
                                />
                                {value}
                              </label>
                            ))}
                          </div>
                          <textarea
                            name="comment"
                            rows={3}
                            maxLength={1000}
                            value={feedbackComment}
                            onChange={(event) => setFeedbackComment(event.target.value)}
                            className="mt-3 w-full rounded-xl border border-sand-200 bg-white p-3 text-sm text-ink-900 outline-none transition-all focus:border-petroleum-500 focus:ring-1 focus:ring-petroleum-500"
                            placeholder="Valfri kommentar till förvaltningen..."
                            aria-label="Valfri kommentar"
                          />
                          <button disabled={loading || feedbackRating < 1} className="mt-3 rounded-lg bg-petroleum-600 px-4 py-2 text-xs font-semibold text-white shadow-sm disabled:opacity-50 hover:bg-petroleum-700 transition-colors">
                            Skicka återkoppling
                          </button>
                        </form>
                      )}
                    </div>
                  ) : null}

                  <form
                    id="public-comment-form"
                    method="post"
                    action={`/api/public/tickets/${encodeURIComponent(reference.trim().toUpperCase())}/comments`}
                    onSubmit={addResidentComment}
                    className="mt-6 border-t border-sand-100 pt-5"
                  >
                    {companySlug ? <input type="hidden" name="companySlug" value={companySlug} /> : null}
                    {trackingToken ? <input type="hidden" name="token" value={trackingToken} /> : null}
                    {trackEmail ? <input type="hidden" name="email" value={trackEmail} /> : null}
                    <p className="text-sm font-semibold text-ink-900">Skicka kommentar</p>
                    <textarea
                      required
                      name="body"
                      rows={3}
                      maxLength={5_000}
                      value={residentComment}
                      onChange={(event) => setResidentComment(event.target.value)}
                      className="mt-3 w-full rounded-xl border border-sand-200 bg-white p-3 text-sm text-ink-900 outline-none transition-all focus:border-petroleum-500 focus:ring-1 focus:ring-petroleum-500"
                      placeholder="Skriv en komplettering eller fråga till förvaltningen..."
                      aria-label="Skicka kommentar"
                    />
                    <button disabled={loading || !residentComment.trim()} className="mt-3 rounded-lg bg-petroleum-600 px-4 py-2 text-xs font-semibold text-white shadow-sm disabled:opacity-50 hover:bg-petroleum-700 transition-colors">
                      Skicka kommentar
                    </button>
                  </form>

                  <form onSubmit={uploadAttachment} className="mt-6 border-t border-sand-100 pt-5">
                    <p className="text-sm font-semibold text-ink-900">Lägg till bilaga</p>
                    <p className="mt-1 text-xs text-ink-500">Bifoga bild eller dokument (PNG, JPG, PDF) upp till 1 MB.</p>
                    <input
                      type="file"
                      aria-label="Lägg till bilaga"
                      accept="image/png,image/jpeg,image/webp,application/pdf,text/plain"
                      onChange={(event) => setAttachmentFile(event.target.files?.[0] || null)}
                      className="mt-3 block w-full rounded-xl border border-sand-200 bg-sand-50/30 p-2.5 text-sm text-ink-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-petroleum-50 file:text-petroleum-700 hover:file:bg-petroleum-100 transition-all cursor-pointer"
                    />
                    <button disabled={loading || !attachmentFile} className="mt-3 rounded-lg bg-white border border-sand-200 px-4 py-2 text-xs font-semibold text-ink-800 shadow-sm disabled:opacity-50 hover:bg-sand-50 transition-colors">
                      Ladda upp
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
