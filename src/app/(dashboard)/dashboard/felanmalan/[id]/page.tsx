"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Bot, BriefcaseBusiness, CheckCircle2, Clock3, FileText, Paperclip, Send, UserRound } from "lucide-react";
import {
  EmptyState,
  InlineAlert,
  PageHeader,
  Panel,
  premiumFieldClass,
  premiumPrimaryButtonClass,
  premiumTextareaClass,
} from "@/components/dashboard/premium-ui";
import { OPERATIONS_STATUS_LABELS, PRIORITY_LABELS } from "@/lib/domain-labels";

type TeamMember = { id: string; name: string | null; email: string };
type WorkOrder = {
  id: string;
  title: string;
  status: string;
  priority: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  created_at: string;
  assigned_to: TeamMember | null;
};
type Ticket = {
  id: string;
  title: string;
  description: string;
  status: string;
  category: string;
  priority: string;
  public_reference: string | null;
  source: string;
  reporter_name: string | null;
  reporter_email: string | null;
  reporter_phone: string | null;
  reporter_unit: string | null;
  property_id: string | null;
  assigned_to_id: string | null;
  ai_summary: string | null;
  ai_recommended_action: string | null;
  ai_confidence: number | null;
  ai_processed_at: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  property: { id: string; name: string; address: string; city: string } | null;
  assigned_to: TeamMember | null;
  comments: Array<{
    id: string;
    body: string;
    is_internal: boolean;
    created_at: string;
    user: { name: string | null; email: string };
  }>;
  attachments: Array<{
    id: string;
    file_name: string;
    content_type: string;
    size_bytes: number;
    data_url: string;
    created_at: string;
  }>;
};
type TimelineItem = { id: string; type: string; title: string; description: string; created_at: string };

const statusLabels = OPERATIONS_STATUS_LABELS;
const priorityLabels = PRIORITY_LABELS;
const dateFormatter = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });

export default function TicketDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null);
  const [canCreateWorkOrder, setCanCreateWorkOrder] = useState(false);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [status, setStatus] = useState("new");
  const [priority, setPriority] = useState("normal");
  const [assignedToId, setAssignedToId] = useState("");
  const [comment, setComment] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creatingWorkOrder, setCreatingWorkOrder] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let mounted = true;
    async function loadData() {
      setLoading(true);
      try {
        const [ticketResponse, teamResponse, timelineResponse, workOrderResponse] = await Promise.all([
          fetch(`/api/tickets/${params.id}`, { cache: "no-store" }),
          fetch("/api/team", { cache: "no-store" }),
          fetch(`/api/tickets/${params.id}/timeline`, { cache: "no-store" }),
          fetch(`/api/tickets/${params.id}/work-order`, { cache: "no-store" }),
        ]);
        if ([ticketResponse, teamResponse, timelineResponse, workOrderResponse].some((response) => response.status === 401)) {
          router.push("/login");
          return;
        }
        const [ticketData, teamData, timelineData, workOrderData] = await Promise.all([
          ticketResponse.json(),
          teamResponse.json(),
          timelineResponse.json(),
          workOrderResponse.json(),
        ]);
        if (!mounted) return;
        if (!ticketResponse.ok) throw new Error(ticketData.error || "Kunde inte hämta ärendet");
        if (!teamResponse.ok) throw new Error(teamData.error || "Kunde inte hämta teamet");
        if (!timelineResponse.ok) throw new Error(timelineData.error || "Kunde inte hämta historiken");
        if (!workOrderResponse.ok) throw new Error(workOrderData.error || "Kunde inte hämta arbetsorderkopplingen");
        setTicket(ticketData.ticket);
        setStatus(ticketData.ticket.status);
        setPriority(ticketData.ticket.priority);
        setAssignedToId(ticketData.ticket.assigned_to_id || "");
        setMembers(teamData.members || []);
        setTimeline(timelineData.timeline || []);
        setWorkOrder(workOrderData.workOrder || null);
        setCanCreateWorkOrder(Boolean(workOrderData.canCreate));
      } catch (caught) {
        if (mounted) setError(caught instanceof Error ? caught.message : "Kunde inte kontakta servern");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void loadData();
    return () => { mounted = false; };
  }, [params.id, router]);

  async function updateTicket(event: React.FormEvent) {
    event.preventDefault();
    setError(""); setSuccess(""); setSaving(true);
    try {
      const response = await fetch(`/api/tickets/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, priority, assignedToId }),
      });
      const data = await response.json();
      if (response.status === 401) { router.push("/login"); return; }
      if (!response.ok) throw new Error(data.error || "Kunde inte uppdatera ärendet");
      setTicket((current) => current ? {
        ...current,
        status: data.ticket.status,
        priority: data.ticket.priority,
        assigned_to: data.ticket.assigned_to,
        assigned_to_id: data.ticket.assigned_to?.id || null,
      } : current);
      setSuccess("Ärendet är uppdaterat.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kunde inte kontakta servern");
    } finally { setSaving(false); }
  }

  async function createWorkOrder() {
    setError(""); setSuccess(""); setCreatingWorkOrder(true);
    try {
      const response = await fetch(`/api/tickets/${params.id}/work-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedToId: assignedToId || null }),
      });
      const data = await response.json();
      if (response.status === 401) { router.push("/login"); return; }
      if (!response.ok) throw new Error(data.error || "Kunde inte skapa arbetsordern");
      setSuccess(data.created ? "Arbetsordern skapades och ärendet kopplades automatiskt." : "Arbetsordern fanns redan och har öppnats.");
      router.push(`/dashboard/arbetsorder/${data.workOrderId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kunde inte kontakta servern");
    } finally { setCreatingWorkOrder(false); }
  }

  async function addComment(event: React.FormEvent) {
    event.preventDefault();
    setError(""); setSuccess(""); setSaving(true);
    try {
      const response = await fetch(`/api/tickets/${params.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: comment }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunde inte lägga till kommentaren");
      setTicket((current) => current ? { ...current, comments: [...current.comments, data.comment] } : current);
      setTimeline((current) => [{ id: data.comment.id, type: "comment", title: "Kommentar", description: data.comment.body, created_at: data.comment.created_at }, ...current]);
      setComment(""); setSuccess("Kommentaren är tillagd.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kunde inte kontakta servern");
    } finally { setSaving(false); }
  }

  async function uploadAttachment(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return;
    setError(""); setSuccess(""); setSaving(true);
    try {
      const formData = new FormData(); formData.append("file", file);
      const response = await fetch(`/api/tickets/${params.id}/attachments`, { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunde inte ladda upp bilagan");
      setTicket((current) => current ? { ...current, attachments: [data.attachment, ...current.attachments] } : current);
      setTimeline((current) => [{ id: data.attachment.id, type: "attachment", title: "Bilaga uppladdad", description: data.attachment.file_name, created_at: data.attachment.created_at }, ...current]);
      setFile(null); setSuccess("Bilagan är uppladdad.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kunde inte kontakta servern");
    } finally { setSaving(false); }
  }

  async function runAiAnalysis() {
    setError(""); setSuccess(""); setAnalyzing(true);
    try {
      const response = await fetch(`/api/tickets/${params.id}/ai`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunde inte AI-analysera ärendet");
      setTicket((current) => current ? { ...current, ...data.ticket } : current);
      setPriority(data.ticket.priority);
      setSuccess("AI-analysen är klar och ärendet är uppdaterat.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kunde inte kontakta servern");
    } finally { setAnalyzing(false); }
  }

  if (loading) return <div className="h-72 animate-pulse rounded-3xl bg-sand-100" />;
  if (!ticket) return <InlineAlert>{error || "Ärendet hittades inte"}</InlineAlert>;

  return <div className="mx-auto max-w-7xl space-y-7">
    <Link href="/dashboard/felanmalan" className="inline-flex items-center gap-2 text-sm font-semibold text-petroleum-700 hover:text-petroleum-900"><ArrowLeft className="h-4 w-4" />Tillbaka till alla ärenden</Link>
    <PageHeader eyebrow="Felanmälan och service" title={ticket.title} description={`Ärende #${ticket.id.slice(0, 8)} · Skapat ${dateFormatter.format(new Date(ticket.created_at))}`} />
    {error ? <InlineAlert>{error}</InlineAlert> : null}
    {success ? <InlineAlert tone="success">{success}</InlineAlert> : null}

    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-6">
        <Panel title="Ärendedetaljer" description="Samlad information, dokumentation och historik för ärendet." bodyClassName="space-y-6 p-6 sm:p-8">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-petroleum-200 bg-petroleum-50 px-3 py-1 text-xs font-semibold text-petroleum-700">{statusLabels[ticket.status] || ticket.status}</span>
            <span className="rounded-full border border-sand-200 bg-sand-50 px-3 py-1 text-xs font-semibold text-ink-600">{priorityLabels[ticket.priority] || ticket.priority}</span>
            <span className="rounded-full border border-sand-200 bg-white px-3 py-1 text-xs font-semibold text-ink-500">{ticket.assigned_to ? ticket.assigned_to.name || ticket.assigned_to.email : "Ej tilldelad"}</span>
          </div>
          {ticket.property ? <div className="rounded-2xl border border-petroleum-100 bg-petroleum-50 p-5"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-petroleum-700">Fastighet</p><p className="mt-2 text-lg font-semibold text-ink-950">{ticket.property.name}</p><p className="mt-1 text-sm text-ink-600">{ticket.property.address}, {ticket.property.city}</p></div> : <InlineAlert>Ärendet saknar fastighetskoppling. Koppla en fastighet innan arbetsorder kan skapas.</InlineAlert>}
          <div><h2 className="text-lg font-semibold text-ink-950">Beskrivning</h2><p className="mt-3 whitespace-pre-wrap rounded-2xl bg-sand-50 p-5 text-sm leading-7 text-ink-700">{ticket.description}</p></div>
          {ticket.source === "public_portal" ? <div className="grid gap-4 rounded-2xl border border-sand-200 p-5 sm:grid-cols-2"><Info label="Rapportör" value={ticket.reporter_name || "Ej angivet"} /><Info label="Referens" value={ticket.public_reference || "Ej angivet"} /><Info label="E-post" value={ticket.reporter_email || "Ej angivet"} /><Info label="Telefon / lägenhet" value={`${ticket.reporter_phone || "Ej angivet"} · ${ticket.reporter_unit || "Ej angivet"}`} /></div> : null}
        </Panel>

        <Panel title="AI-insikt" description="Prioritering och rekommenderad åtgärd baserad på ärendets innehåll." bodyClassName="p-6 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><Bot className="h-5 w-5 text-petroleum-700" /><p className="text-sm text-ink-600">Analysera ärendet och uppdatera rekommendationen.</p></div><button type="button" onClick={runAiAnalysis} disabled={analyzing} className={premiumPrimaryButtonClass}>{analyzing ? "Analyserar…" : "AI-analysera"}</button></div>
          {ticket.ai_summary ? <div className="mt-5 grid gap-4 md:grid-cols-3"><Insight label="Sammanfattning" value={ticket.ai_summary} /><Insight label="Rekommenderad åtgärd" value={ticket.ai_recommended_action || "Saknas"} /><Insight label="Konfidens" value={`${Math.round((ticket.ai_confidence || 0) * 100)} %`} /></div> : null}
        </Panel>

        <Panel title="Bilagor" description="Foton, dokument och underlag kopplade till ärendet." bodyClassName="p-6 sm:p-8">
          {ticket.attachments.length ? <div className="grid gap-3 sm:grid-cols-2">{ticket.attachments.map((attachment) => <a key={attachment.id} href={attachment.data_url} target="_blank" rel="noreferrer" className="rounded-2xl border border-sand-200 p-4 transition hover:bg-sand-50"><FileText className="h-5 w-5 text-petroleum-700" /><p className="mt-3 font-semibold text-ink-900">{attachment.file_name}</p><p className="mt-1 text-xs text-ink-400">{Math.ceil(attachment.size_bytes / 1024)} KB</p></a>)}</div> : <EmptyState title="Inga bilagor" description="Ladda upp ett underlag från panelen till höger." />}
        </Panel>

        <Panel title="Kommentarer och tidslinje" description="Operativ historik för handläggningen." bodyClassName="space-y-6 p-6 sm:p-8">
          <div className="space-y-3">{ticket.comments.map((item) => <div key={item.id} className="rounded-2xl border border-sand-200 p-4"><p className="text-sm leading-6 text-ink-700">{item.body}</p><p className="mt-3 text-xs text-ink-400">{item.user.name || item.user.email} · {dateFormatter.format(new Date(item.created_at))}</p></div>)}</div>
          <div className="border-t border-sand-200 pt-6"><h3 className="font-semibold text-ink-900">Tidslinje</h3><div className="mt-4 space-y-3">{timeline.map((item) => <div key={`${item.type}-${item.id}`} className="flex gap-3"><Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-petroleum-600" /><div><p className="text-sm font-semibold text-ink-900">{item.title}</p><p className="mt-1 text-sm text-ink-500">{item.description}</p><p className="mt-1 text-xs text-ink-400">{dateFormatter.format(new Date(item.created_at))}</p></div></div>)}</div></div>
        </Panel>
      </div>

      <aside className="space-y-6">
        <Panel title="Arbetsorder" description="Operativ åtgärd kopplad till ärendet." bodyClassName="p-6">
          {workOrder ? <div className="space-y-4"><div className="rounded-2xl border border-petroleum-100 bg-petroleum-50 p-4"><div className="flex items-center gap-3"><CheckCircle2 className="h-5 w-5 text-petroleum-700" /><div><p className="text-xs font-semibold uppercase tracking-wide text-petroleum-700">Kopplad arbetsorder</p><p className="mt-1 font-semibold text-ink-950">{workOrder.title}</p></div></div><div className="mt-4 flex flex-wrap gap-2"><span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-petroleum-700">{statusLabels[workOrder.status] || workOrder.status}</span><span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-ink-600">{priorityLabels[workOrder.priority] || workOrder.priority}</span></div></div><Link href={`/dashboard/arbetsorder/${workOrder.id}`} className={`${premiumPrimaryButtonClass} w-full justify-center`}><BriefcaseBusiness className="h-4 w-4" />Öppna arbetsorder</Link></div> : <div className="space-y-4"><p className="text-sm leading-6 text-ink-600">Skapa en arbetsorder med ärendets titel, beskrivning, prioritet, fastighet och ansvarig.</p><button type="button" onClick={createWorkOrder} disabled={!canCreateWorkOrder || creatingWorkOrder} className={`${premiumPrimaryButtonClass} w-full justify-center`}><BriefcaseBusiness className="h-4 w-4" />{creatingWorkOrder ? "Skapar arbetsorder…" : "Skapa arbetsorder"}</button>{!canCreateWorkOrder ? <p className="text-xs font-medium text-amber-700">Fastighet måste väljas innan arbetsorder kan skapas.</p> : null}</div>}
        </Panel>

        <Panel title="Styr ärendet" description="Status, prioritet och ansvarig." bodyClassName="p-6"><form onSubmit={updateTicket} className="space-y-4"><SelectField label="Status" value={status} onChange={setStatus} options={Object.entries(statusLabels).filter(([value]) => ["new", "received", "in_progress", "waiting", "completed", "closed"].includes(value))} /><SelectField label="Prioritet" value={priority} onChange={setPriority} options={Object.entries(priorityLabels)} /><label className="block"><span className="mb-2 flex items-center gap-2 text-xs font-semibold text-ink-600"><UserRound className="h-4 w-4" />Ansvarig</span><select value={assignedToId} onChange={(event) => setAssignedToId(event.target.value)} className={premiumFieldClass}><option value="">Ej tilldelad</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name || member.email}</option>)}</select></label><button disabled={saving} className={`${premiumPrimaryButtonClass} w-full justify-center`}>{saving ? "Sparar…" : "Spara ändringar"}</button></form></Panel>

        <Panel title="Ny kommentar" description="Dokumentera nästa åtgärd." bodyClassName="p-6"><form onSubmit={addComment}><textarea required minLength={2} rows={4} value={comment} onChange={(event) => setComment(event.target.value)} className={premiumTextareaClass} placeholder="Skriv en uppdatering…" /><button disabled={saving} className={`${premiumPrimaryButtonClass} mt-4 w-full justify-center`}><Send className="h-4 w-4" />Lägg till kommentar</button></form></Panel>

        <Panel title="Ladda upp bilaga" description="PNG, JPG, WebP, PDF eller TXT." bodyClassName="p-6"><form onSubmit={uploadAttachment}><input type="file" accept="image/png,image/jpeg,image/webp,application/pdf,text/plain" onChange={(event) => setFile(event.target.files?.[0] || null)} className="block w-full text-sm text-ink-500 file:mr-3 file:rounded-lg file:border-0 file:bg-sand-100 file:px-3 file:py-2 file:font-semibold file:text-ink-700" /><button disabled={!file || saving} className={`${premiumPrimaryButtonClass} mt-4 w-full justify-center`}><Paperclip className="h-4 w-4" />Ladda upp</button></form></Panel>
      </aside>
    </section>
  </div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label}</p><p className="mt-1 text-sm font-semibold text-ink-800">{value}</p></div>;
}
function Insight({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-sand-50 p-4"><p className="text-[11px] font-semibold uppercase tracking-wide text-petroleum-700">{label}</p><p className="mt-2 text-sm leading-6 text-ink-700">{value}</p></div>;
}
function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
  return <label className="block"><span className="mb-2 block text-xs font-semibold text-ink-600">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className={premiumFieldClass}>{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>;
}
