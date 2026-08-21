"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  FileCheck2,
  ListChecks,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  TrendingUp,
  Wrench,
  X,
} from "lucide-react";
import {
  EmptyState,
  InlineAlert,
  LoadingState,
  MetricCard,
  PageHeader,
  Panel,
  premiumCompactButtonClass,
  premiumDangerButtonClass,
  premiumFieldClass,
  premiumPrimaryButtonClass,
  premiumSecondaryButtonClass,
  premiumTextareaClass,
} from "@/components/dashboard/premium-ui";
import { INSPECTION_CHECKLIST_CATEGORY_LABELS } from "@/lib/inspection-checklist-template";
import { readResponseJson } from "@/lib/fetch-json";

type Property = { id: string; name: string; address: string; city: string };
type ChecklistItem = {
  id: string;
  label: string;
  completed: boolean;
  hasDeviation: boolean;
  note: string;
  workOrderId: string | null;
};
type Round = {
  id: string;
  createdAt?: string;
  updatedAt?: string;
  title?: string;
  propertyId?: string;
  propertyName?: string;
  propertyAddress?: string;
  propertyCity?: string;
  interval?: string;
  status?: string;
  nextDue?: string;
  checklist?: ChecklistItem[];
  deviations?: number;
  source?: "table" | "legacy" | string;
};
type ChecklistTemplate = {
  id: string;
  name: string;
  category: string;
  description: string;
  items: string[];
  itemCount: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};
type RoundTab = "planned" | "in_progress" | "overdue" | "completed" | "all";

type TemplateForm = {
  name: string;
  category: string;
  description: string;
  itemsText: string;
};

type RoundForm = {
  title: string;
  propertyId: string;
  interval: string;
  nextDue: string;
  templateId: string;
  checklistText: string;
};

const intervalLabels: Record<string, string> = {
  weekly: "Veckorond",
  monthly: "Månadsrond",
  quarterly: "Kvartalsrond",
  yearly: "Årsrond",
};
const intervalLongLabels: Record<string, string> = {
  weekly: "Varje vecka",
  monthly: "Varje månad",
  quarterly: "Varje kvartal",
  yearly: "Varje år",
};
const statusLabels: Record<string, string> = {
  planned: "Planerad",
  in_progress: "Pågående",
  completed: "Genomförd",
};
const templateCategories = Object.keys(INSPECTION_CHECKLIST_CATEGORY_LABELS);
const dateFormat = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" });
const dateTimeFormat = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });

const emptyRoundForm: RoundForm = {
  title: "",
  propertyId: "",
  interval: "monthly",
  nextDue: "",
  templateId: "",
  checklistText: "Kontrollera entréer och belysning\nKontrollera dörrar och lås\nKontrollera allmänna ytor",
};
const emptyTemplateForm: TemplateForm = {
  name: "",
  category: "general",
  description: "",
  itemsText: "",
};

function dateMs(value?: string) {
  if (!value) return Number.NaN;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function isOverdue(round: Round, nowMs: number) {
  const due = dateMs(round.nextDue);
  return round.status !== "completed" && Number.isFinite(due) && due < nowMs;
}

function addressedCount(round: Round) {
  return (round.checklist || []).filter((item) => item.completed || item.hasDeviation).length;
}

function roundResult(round: Round) {
  const items = round.checklist || [];
  if (!items.length) return null;
  const approved = items.filter((item) => item.completed && !item.hasDeviation).length;
  return Math.round((approved / items.length) * 100);
}

function openDeviationCount(round: Round) {
  return (round.checklist || []).filter((item) => item.hasDeviation && !item.workOrderId).length;
}

function statusPill(round: Round, nowMs: number) {
  if (isOverdue(round, nowMs)) return { label: "Försenad", className: "border-red-100 bg-red-50 text-red-700" };
  if (round.status === "completed") return { label: "Genomförd", className: "border-emerald-100 bg-emerald-50 text-emerald-700" };
  if (round.status === "in_progress") return { label: "Pågående", className: "border-amber-100 bg-amber-50 text-amber-800" };
  return { label: "Planerad", className: "border-petroleum-100 bg-petroleum-50 text-petroleum-800" };
}

function daysOverdue(round: Round, nowMs: number) {
  const due = dateMs(round.nextDue);
  if (!Number.isFinite(due) || due >= nowMs) return 0;
  return Math.max(1, Math.ceil((nowMs - due) / 86400000));
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export default function RoundsPage() {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [savingId, setSavingId] = useState("");

  const [query, setQuery] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("");
  const [intervalFilter, setIntervalFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [activeTab, setActiveTab] = useState<RoundTab>("planned");
  const [page, setPage] = useState(1);

  const [selectedRoundId, setSelectedRoundId] = useState("");
  const [editingRoundFields, setEditingRoundFields] = useState(false);
  const [editRoundForm, setEditRoundForm] = useState({ title: "", interval: "monthly", nextDue: "" });

  const [roundModalOpen, setRoundModalOpen] = useState(false);
  const [roundForm, setRoundForm] = useState<RoundForm>(emptyRoundForm);
  const [savingRound, setSavingRound] = useState(false);

  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState("");
  const [templateForm, setTemplateForm] = useState<TemplateForm>(emptyTemplateForm);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [confirmDeleteTemplate, setConfirmDeleteTemplate] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [roundResponse, propertyResponse, templateResponse] = await Promise.all([
        fetch("/api/rounds", { cache: "no-store" }),
        fetch("/api/properties", { cache: "no-store" }),
        fetch("/api/round-checklists", { cache: "no-store" }),
      ]);
      const [roundData, propertyData, templateData] = await Promise.all([
        readResponseJson<{ rounds?: Round[]; permissions?: { canManage?: boolean }; error?: string }>(roundResponse),
        readResponseJson<{ properties?: Property[]; error?: string }>(propertyResponse),
        readResponseJson<{ templates?: ChecklistTemplate[]; permissions?: { canManage?: boolean }; error?: string }>(templateResponse),
      ]);
      if (!roundResponse.ok) throw new Error(roundData.error || "Kunde inte hämta ronder");
      if (!propertyResponse.ok) throw new Error(propertyData.error || "Kunde inte hämta fastigheter");
      if (!templateResponse.ok) throw new Error(templateData.error || "Kunde inte hämta checklistor");
      setRounds(roundData.rounds || []);
      setProperties(propertyData.properties || []);
      setTemplates(templateData.templates || []);
      setCanManage(Boolean(roundData.permissions?.canManage && templateData.permissions?.canManage));
      setRoundForm((current) => ({
        ...current,
        propertyId: current.propertyId || propertyData.properties?.[0]?.id || "",
      }));
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte läsa rondsystemet");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => { setPage(1); }, [activeTab, fromDate, intervalFilter, propertyFilter, query, toDate]);

  const nowMs = Date.now();
  const selectedRound = rounds.find((round) => round.id === selectedRoundId) || null;
  const overdueRounds = rounds
    .filter((round) => isOverdue(round, nowMs))
    .sort((a, b) => dateMs(a.nextDue) - dateMs(b.nextDue));
  const nextThirty = rounds.filter((round) => {
    const due = dateMs(round.nextDue);
    return round.status !== "completed" && Number.isFinite(due) && due >= nowMs && due <= nowMs + 30 * 86400000;
  }).length;
  const completedRounds = rounds.filter((round) => round.status === "completed");
  const completionRate = rounds.length ? Math.round((completedRounds.length / rounds.length) * 100) : 0;
  const openDeviations = rounds.reduce((sum, round) => sum + openDeviationCount(round), 0);
  const completedResults = completedRounds.map(roundResult).filter((value): value is number => value !== null);
  const averageResult = completedResults.length
    ? Math.round(completedResults.reduce((sum, value) => sum + value, 0) / completedResults.length)
    : null;

  const deviations = rounds.flatMap((round) => (round.checklist || [])
    .filter((item) => item.hasDeviation)
    .map((item) => ({
      roundId: round.id,
      roundTitle: round.title || "Rond",
      propertyName: round.propertyName || "Fastighet",
      item,
      updatedAt: round.updatedAt || round.createdAt || "",
      overdue: isOverdue(round, nowMs),
    })))
    .sort((a, b) => dateMs(b.updatedAt) - dateMs(a.updatedAt));

  const filteredRounds = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const fromMs = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : Number.NaN;
    const toMs = toDate ? new Date(`${toDate}T23:59:59`).getTime() : Number.NaN;
    const currentNow = Date.now();
    return rounds.filter((round) => {
      if (propertyFilter && round.propertyId !== propertyFilter) return false;
      if (intervalFilter && round.interval !== intervalFilter) return false;
      const due = dateMs(round.nextDue);
      if (Number.isFinite(fromMs) && (!Number.isFinite(due) || due < fromMs)) return false;
      if (Number.isFinite(toMs) && (!Number.isFinite(due) || due > toMs)) return false;
      if (activeTab === "planned" && round.status !== "planned") return false;
      if (activeTab === "in_progress" && round.status !== "in_progress") return false;
      if (activeTab === "completed" && round.status !== "completed") return false;
      if (activeTab === "overdue" && !isOverdue(round, currentNow)) return false;
      if (needle) {
        const haystack = [round.title, round.propertyName, round.propertyAddress, round.propertyCity, intervalLabels[round.interval || "monthly"]]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [activeTab, fromDate, intervalFilter, propertyFilter, query, rounds, toDate]);

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filteredRounds.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedRounds = filteredRounds.slice((safePage - 1) * pageSize, safePage * pageSize);

  const tabCounts: Record<RoundTab, number> = {
    planned: rounds.filter((round) => round.status === "planned").length,
    in_progress: rounds.filter((round) => round.status === "in_progress").length,
    overdue: overdueRounds.length,
    completed: completedRounds.length,
    all: rounds.length,
  };

  const chartMonths = useMemo(() => {
    const current = new Date();
    const months = Array.from({ length: 12 }, (_, offset) => {
      const date = new Date(current.getFullYear(), current.getMonth() - 11 + offset, 1);
      return {
        key: monthKey(date),
        label: new Intl.DateTimeFormat("sv-SE", { month: "short" }).format(date).replace(".", ""),
        approved: 0,
        attention: 0,
        failed: 0,
      };
    });
    const byKey = new Map(months.map((month) => [month.key, month]));
    rounds.filter((round) => round.status === "completed").forEach((round) => {
      const rawDate = round.updatedAt || round.createdAt;
      if (!rawDate) return;
      const date = new Date(rawDate);
      if (Number.isNaN(date.getTime())) return;
      const bucket = byKey.get(monthKey(date));
      if (!bucket) return;
      const result = roundResult(round) ?? 0;
      if (result >= 90) bucket.approved += 1;
      else if (result >= 60) bucket.attention += 1;
      else bucket.failed += 1;
    });
    return months;
  }, [rounds]);
  const chartMax = Math.max(1, ...chartMonths.map((month) => month.approved + month.attention + month.failed));

  function clearMessages() {
    setError("");
    setMessage("");
  }

  function openNewRound(template?: ChecklistTemplate) {
    clearMessages();
    setRoundForm({
      ...emptyRoundForm,
      propertyId: properties[0]?.id || "",
      title: template ? template.name : "",
      templateId: template?.id || "",
      checklistText: template ? "" : emptyRoundForm.checklistText,
    });
    setRoundModalOpen(true);
  }

  async function createRound(event: React.FormEvent) {
    event.preventDefault();
    clearMessages();
    const checklist = roundForm.templateId
      ? []
      : roundForm.checklistText.split("\n").map((item) => item.trim()).filter(Boolean);
    if (!roundForm.templateId && checklist.length === 0) {
      setError("Lägg till minst en kontrollpunkt eller välj en sparad checklista.");
      return;
    }
    setSavingRound(true);
    try {
      const response = await fetch("/api/rounds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: roundForm.title,
          propertyId: roundForm.propertyId,
          interval: roundForm.interval,
          nextDue: roundForm.nextDue ? new Date(`${roundForm.nextDue}T12:00:00`).toISOString() : undefined,
          checklistTemplateId: roundForm.templateId || undefined,
          checklist,
        }),
      });
      const data = await readResponseJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte skapa ronden");
      setRoundModalOpen(false);
      setMessage("Ronden har skapats och lagts in i kontrollplanen.");
      await load();
      setActiveTab("planned");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte skapa ronden");
    } finally {
      setSavingRound(false);
    }
  }

  function openNewTemplate() {
    clearMessages();
    setEditingTemplateId("");
    setTemplateForm(emptyTemplateForm);
    setConfirmDeleteTemplate(false);
    setTemplateModalOpen(true);
  }

  function openEditTemplate(template: ChecklistTemplate) {
    clearMessages();
    setEditingTemplateId(template.id);
    setTemplateForm({
      name: template.name,
      category: template.category,
      description: template.description,
      itemsText: template.items.join("\n"),
    });
    setConfirmDeleteTemplate(false);
    setTemplateModalOpen(true);
  }

  async function saveTemplate(event: React.FormEvent) {
    event.preventDefault();
    clearMessages();
    const items = templateForm.itemsText.split("\n").map((item) => item.trim()).filter(Boolean);
    if (!items.length) {
      setError("Checklistan måste innehålla minst en kontrollpunkt.");
      return;
    }
    setSavingTemplate(true);
    try {
      const response = await fetch(editingTemplateId ? `/api/round-checklists/${editingTemplateId}` : "/api/round-checklists", {
        method: editingTemplateId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: templateForm.name,
          category: templateForm.category,
          description: templateForm.description,
          items,
        }),
      });
      const data = await readResponseJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte spara checklistan");
      setTemplateModalOpen(false);
      setMessage(editingTemplateId ? "Checklistan är uppdaterad." : "Checklistan är skapad och kan nu användas i nya ronder.");
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte spara checklistan");
    } finally {
      setSavingTemplate(false);
    }
  }

  async function deleteTemplate() {
    if (!editingTemplateId) return;
    setSavingTemplate(true);
    clearMessages();
    try {
      const response = await fetch(`/api/round-checklists/${editingTemplateId}`, { method: "DELETE" });
      const data = await readResponseJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte ta bort checklistan");
      setTemplateModalOpen(false);
      setMessage("Checklistan har tagits bort. Befintliga ronder behåller sina kontrollpunkter.");
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte ta bort checklistan");
    } finally {
      setSavingTemplate(false);
      setConfirmDeleteTemplate(false);
    }
  }

  function openRound(round: Round) {
    setSelectedRoundId(round.id);
    setEditingRoundFields(false);
    setEditRoundForm({
      title: round.title || "",
      interval: round.interval || "monthly",
      nextDue: round.nextDue ? new Date(round.nextDue).toISOString().slice(0, 10) : "",
    });
    clearMessages();
  }

  function updateLocalChecklist(roundId: string, itemId: string, patch: Partial<ChecklistItem>) {
    setRounds((current) => current.map((round) => {
      if (round.id !== roundId || !round.checklist) return round;
      const checklist = round.checklist.map((item) => item.id === itemId ? { ...item, ...patch } : item);
      return { ...round, checklist, deviations: checklist.filter((item) => item.hasDeviation).length };
    }));
  }

  async function saveChecklist(round: Round) {
    if (round.source === "legacy") {
      setError("Äldre ronder måste migreras innan de kan uppdateras.");
      return;
    }
    setSavingId(round.id);
    clearMessages();
    try {
      const response = await fetch(`/api/rounds/${round.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checklist: round.checklist }),
      });
      const data = await readResponseJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte spara ronden");
      setMessage("Rondens checklista är sparad.");
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte spara ronden");
    } finally {
      setSavingId("");
    }
  }

  async function saveRoundFields(round: Round) {
    if (round.source === "legacy") return;
    setSavingId(round.id);
    clearMessages();
    try {
      const response = await fetch(`/api/rounds/${round.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editRoundForm.title,
          interval: editRoundForm.interval,
          nextDue: editRoundForm.nextDue ? new Date(`${editRoundForm.nextDue}T12:00:00`).toISOString() : undefined,
        }),
      });
      const data = await readResponseJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte uppdatera ronden");
      setEditingRoundFields(false);
      setMessage("Rondens planering är uppdaterad.");
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte uppdatera ronden");
    } finally {
      setSavingId("");
    }
  }

  async function createWorkOrders(round: Round) {
    if (round.source === "legacy") {
      setError("Äldre ronder måste migreras innan arbetsorder kan skapas.");
      return;
    }
    const open = (round.checklist || []).filter((item) => item.hasDeviation && !item.workOrderId);
    if (!open.length) {
      setError("Det finns inga öppna avvikelser utan arbetsorder.");
      return;
    }
    setSavingId(round.id);
    clearMessages();
    try {
      const saveResponse = await fetch(`/api/rounds/${round.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checklist: round.checklist }),
      });
      const saveData = await readResponseJson<{ error?: string }>(saveResponse);
      if (!saveResponse.ok) throw new Error(saveData.error || "Kunde inte spara ronden");

      const response = await fetch(`/api/rounds/${round.id}/work-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds: open.map((item) => item.id) }),
      });
      const data = await readResponseJson<{ created?: unknown[]; error?: string }>(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte skapa arbetsorder");
      setMessage(`${data.created?.length || 0} arbetsorder skapades från rondens avvikelser.`);
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte skapa arbetsorder");
    } finally {
      setSavingId("");
    }
  }

  function showControlPlans(tab: RoundTab = "all") {
    setActiveTab(tab);
    document.getElementById("rondlista")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="space-y-7 animate-fade-in-soft">
      <PageHeader
        eyebrow="Drift · Tillsyn"
        title="Ronder & checklistor"
        description="Planera, genomför och följ upp återkommande ronder och checklistkontroller i hela beståndet."
        action={canManage ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => document.getElementById("kontrollplaner")?.scrollIntoView({ behavior: "smooth" })} className={premiumSecondaryButtonClass}>
              <FileCheck2 className="mr-2 h-4 w-4" aria-hidden="true" /> Kontrollplaner
            </button>
            <button type="button" onClick={openNewTemplate} className={premiumSecondaryButtonClass}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Ny checklista
            </button>
            <button type="button" onClick={() => openNewRound()} className={premiumPrimaryButtonClass}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Ny rond
            </button>
          </div>
        ) : undefined}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={CalendarDays} label="Planerade ronder" value={nextThirty} hint="Nästa 30 dagar" />
        <MetricCard icon={CheckCircle2} label="Genomförandegrad" value={`${completionRate}%`} hint="Slutförda av registrerade ronder" />
        <MetricCard icon={AlertTriangle} label="Försenade ronder" value={overdueRounds.length} hint="Kräver uppföljning" />
        <MetricCard icon={ClipboardCheck} label="Öppna avvikelser" value={openDeviations} hint="Saknar kopplad arbetsorder" />
        <MetricCard icon={TrendingUp} label="Genomsnittligt resultat" value={averageResult === null ? "—" : `${averageResult}%`} hint="Genomförda ronder" />
      </section>

      {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
      {message ? <InlineAlert tone="success">{message}</InlineAlert> : null}
      {!canManage && !loading ? <InlineAlert tone="info">Du har läsbehörighet. Förvaltare eller administratör kan skapa ronder och checklistor, dokumentera avvikelser och skapa arbetsorder.</InlineAlert> : null}

      <section id="rondlista" className="grid scroll-mt-28 gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Panel title="Rondöversikt" description="Sök, filtrera och öppna rondens kontrollpunkter direkt från planeringen." bodyClassName="p-0">
          <div className="grid gap-3 border-b border-sand-200 p-4 sm:p-5 lg:grid-cols-[minmax(220px,1.4fr)_180px_160px_150px_150px]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} className={`${premiumFieldClass} pl-9`} placeholder="Sök rond, fastighet eller adress" aria-label="Sök ronder" />
            </label>
            <select value={propertyFilter} onChange={(event) => setPropertyFilter(event.target.value)} className={premiumFieldClass} aria-label="Filtrera fastighet">
              <option value="">Alla fastigheter</option>
              {properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
            </select>
            <select value={intervalFilter} onChange={(event) => setIntervalFilter(event.target.value)} className={premiumFieldClass} aria-label="Filtrera rondtyp">
              <option value="">Alla rondtyper</option>
              {Object.entries(intervalLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className={premiumFieldClass} aria-label="Från datum" />
            <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className={premiumFieldClass} aria-label="Till datum" />
          </div>

          <div className="border-b border-sand-200 px-4 sm:px-5">
            <div className="flex gap-1 overflow-x-auto">
              {([
                ["planned", "Planerade"],
                ["in_progress", "Pågående"],
                ["overdue", "Försenade"],
                ["completed", "Slutförda"],
                ["all", "Alla ronder"],
              ] as Array<[RoundTab, string]>).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setActiveTab(value)}
                  className={`whitespace-nowrap border-b-2 px-3 py-3 text-xs font-semibold transition ${activeTab === value ? "border-petroleum-800 text-petroleum-900" : "border-transparent text-ink-500 hover:text-ink-800"}`}
                >
                  {label} ({tabCounts[value]})
                </button>
              ))}
            </div>
          </div>

          {loading ? <LoadingState label="Hämtar ronder…" rows={6} /> : pagedRounds.length === 0 ? (
            <EmptyState icon={ClipboardCheck} title="Inga ronder hittades" description={rounds.length ? "Justera filter eller välj en annan status." : "Skapa den första ronden för att börja bygga kontrollplanen."} />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[960px] w-full text-left">
                <thead>
                  <tr className="text-[10px] font-semibold uppercase tracking-[0.11em] text-ink-500">
                    <th className="px-5 py-3">Rond</th>
                    <th className="px-4 py-3">Fastighet</th>
                    <th className="px-4 py-3">Rondtyp</th>
                    <th className="px-4 py-3">När</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Resultat</th>
                    <th className="px-4 py-3">Checklista</th>
                    <th className="w-14 px-3 py-3"><span className="sr-only">Åtgärd</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sand-100">
                  {pagedRounds.map((round) => {
                    const pill = statusPill(round, nowMs);
                    const result = roundResult(round);
                    const addressed = addressedCount(round);
                    const total = round.checklist?.length || 0;
                    return (
                      <tr key={round.id} className="group">
                        <td className="px-5 py-4">
                          <button type="button" onClick={() => openRound(round)} className="max-w-[250px] text-left outline-none focus-visible:ring-2 focus-visible:ring-petroleum-300">
                            <span className="block truncate text-sm font-semibold text-ink-900 group-hover:text-petroleum-900">{round.title || "Rond"}</span>
                            <span className="mt-1 block truncate text-[11px] text-ink-500">{openDeviationCount(round) ? `${openDeviationCount(round)} öppen avvikelse` : "Inga öppna avvikelser"}</span>
                          </button>
                        </td>
                        <td className="px-4 py-4">
                          <p className="text-xs font-semibold text-ink-800">{round.propertyName || "Fastighet"}</p>
                          <p className="mt-1 max-w-[180px] truncate text-[11px] text-ink-500">{[round.propertyAddress, round.propertyCity].filter(Boolean).join(", ") || "Adress saknas"}</p>
                        </td>
                        <td className="px-4 py-4 text-xs text-ink-700">{intervalLabels[round.interval || "monthly"] || round.interval}</td>
                        <td className="px-4 py-4">
                          <p className={`text-xs font-semibold ${isOverdue(round, nowMs) ? "text-red-700" : "text-ink-800"}`}>{round.nextDue ? dateFormat.format(new Date(round.nextDue)) : "Ej satt"}</p>
                          <p className="mt-1 text-[11px] text-ink-500">{intervalLongLabels[round.interval || "monthly"]}</p>
                        </td>
                        <td className="px-4 py-4"><span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold ${pill.className}`}>{pill.label}</span></td>
                        <td className="px-4 py-4">{round.status === "completed" && result !== null ? <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${result >= 90 ? "bg-emerald-50 text-emerald-700" : result >= 60 ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-700"}`}>{result}%</span> : <span className="text-xs text-ink-400">—</span>}</td>
                        <td className="px-4 py-4">
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-700">
                            {addressed === total && total > 0 ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Circle className="h-3.5 w-3.5 text-ink-300" />}
                            {addressed}/{total}
                          </span>
                        </td>
                        <td className="px-3 py-4">
                          <button type="button" onClick={() => openRound(round)} className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-500 transition hover:bg-sand-100 hover:text-ink-900 focus-visible:ring-2 focus-visible:ring-petroleum-300" aria-label={`Öppna ${round.title || "rond"}`}>
                            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-sand-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-ink-500">Visar {filteredRounds.length ? (safePage - 1) * pageSize + 1 : 0}–{Math.min(safePage * pageSize, filteredRounds.length)} av {filteredRounds.length} ronder</p>
            <div className="flex items-center gap-1">
              <button type="button" disabled={safePage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className={`${premiumCompactButtonClass} disabled:opacity-40`}>Föregående</button>
              <span className="px-2 text-xs font-semibold text-ink-600">{safePage} / {totalPages}</span>
              <button type="button" disabled={safePage >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className={`${premiumCompactButtonClass} disabled:opacity-40`}>Nästa</button>
            </div>
          </div>
        </Panel>

        <div className="space-y-5">
          <Panel title="Försenade ronder" description={overdueRounds.length ? `${overdueRounds.length} rond${overdueRounds.length === 1 ? "" : "er"} behöver planeras om eller genomföras.` : "Inga försenade ronder just nu."} bodyClassName="p-0">
            {overdueRounds.length === 0 ? <div className="p-5 text-sm text-ink-500">Beståndet ligger i fas med kontrollplanen.</div> : (
              <div className="divide-y divide-sand-100">
                {overdueRounds.slice(0, 5).map((round) => (
                  <button key={round.id} type="button" onClick={() => openRound(round)} className="flex w-full items-center justify-between gap-3 p-4 text-left transition hover:bg-sand-50">
                    <span className="min-w-0"><span className="block truncate text-xs font-semibold text-ink-900">{round.propertyName || round.title}</span><span className="mt-1 block truncate text-[11px] text-ink-500">{round.title}</span></span>
                    <span className="shrink-0 text-[11px] font-semibold text-red-700">{daysOverdue(round, nowMs)} dagar</span>
                  </button>
                ))}
              </div>
            )}
            {overdueRounds.length > 5 ? <button type="button" onClick={() => showControlPlans("overdue")} className="flex w-full items-center justify-between border-t border-sand-100 px-4 py-3 text-xs font-semibold text-petroleum-800">Visa alla försenade <ArrowRight className="h-3.5 w-3.5" /></button> : null}
          </Panel>

          <Panel title="Senaste avvikelserna" description="Kontrollpunkter som har markerats med anmärkning." bodyClassName="p-0">
            {deviations.length === 0 ? <div className="p-5 text-sm text-ink-500">Inga avvikelser registrerade.</div> : (
              <div className="divide-y divide-sand-100">
                {deviations.slice(0, 5).map((deviation) => (
                  <button key={`${deviation.roundId}-${deviation.item.id}`} type="button" onClick={() => {
                    const round = rounds.find((item) => item.id === deviation.roundId);
                    if (round) openRound(round);
                  }} className="w-full p-4 text-left transition hover:bg-sand-50">
                    <div className="flex items-start justify-between gap-2"><p className="text-xs font-semibold text-ink-900">{deviation.item.label}</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${deviation.item.workOrderId ? "bg-emerald-50 text-emerald-700" : deviation.overdue ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>{deviation.item.workOrderId ? "Arbetsorder" : deviation.overdue ? "Hög" : "Öppen"}</span></div>
                    <p className="mt-1 text-[11px] text-ink-500">{deviation.propertyName} · {deviation.roundTitle}</p>
                  </button>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </section>

      <section id="kontrollplaner" className="grid scroll-mt-28 gap-5 xl:grid-cols-[0.9fr_1.7fr_1fr]">
        <Panel title="Kontrollplaner" description="Återkommande ronder samlade per fastighet och intervall." icon={FileCheck2}>
          <div className="space-y-3">
            <InfoRow label="Aktiva ronder" value={String(rounds.filter((round) => round.status !== "completed").length)} />
            <InfoRow label="Fastigheter med rond" value={String(new Set(rounds.map((round) => round.propertyId).filter(Boolean)).size)} />
            <InfoRow label="Sparade checklistor" value={String(templates.length)} />
          </div>
          <button type="button" onClick={() => showControlPlans("all")} className={`${premiumSecondaryButtonClass} mt-5 w-full justify-between`}>Hantera kontrollplaner <ArrowRight className="h-4 w-4" /></button>
        </Panel>

        <Panel title="Rondernas resultat" description="Genomförda ronder de senaste 12 månaderna, grupperade efter kontrollresultat." bodyClassName="px-5 pb-5 pt-3">
          <div className="mb-4 flex flex-wrap gap-4 text-[11px] font-medium text-ink-500">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Godkända</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-amber-400" /> Med anmärkning</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-red-400" /> Underkända</span>
          </div>
          <div className="flex h-44 items-end gap-2 border-b border-sand-200 px-1 pb-0">
            {chartMonths.map((month) => {
              const total = month.approved + month.attention + month.failed;
              const height = total ? Math.max(12, (total / chartMax) * 150) : 4;
              const approvedPct = total ? (month.approved / total) * 100 : 0;
              const attentionPct = total ? (month.attention / total) * 100 : 0;
              const failedPct = total ? (month.failed / total) * 100 : 0;
              return (
                <div key={month.key} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
                  <div className="flex w-full max-w-7 flex-col-reverse overflow-hidden rounded-t-sm bg-sand-100" style={{ height: `${height}px` }} title={`${month.label}: ${total} genomförda`}>
                    {approvedPct ? <div className="bg-emerald-500" style={{ height: `${approvedPct}%` }} /> : null}
                    {attentionPct ? <div className="bg-amber-400" style={{ height: `${attentionPct}%` }} /> : null}
                    {failedPct ? <div className="bg-red-400" style={{ height: `${failedPct}%` }} /> : null}
                  </div>
                  <span className="text-[9px] font-medium capitalize text-ink-400">{month.label}</span>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="Checklistor" description="Återanvänd kontrollpunkter i nya ronder." icon={ListChecks} bodyClassName="p-0">
          <div className="border-b border-sand-100 p-4">
            {canManage ? <button type="button" onClick={openNewTemplate} className={`${premiumSecondaryButtonClass} w-full`}><Plus className="mr-2 h-4 w-4" /> Ny checklista</button> : null}
          </div>
          {templates.length === 0 ? <div className="p-5 text-sm text-ink-500">Inga sparade checklistor ännu.</div> : (
            <div className="divide-y divide-sand-100">
              {templates.slice(0, 4).map((template) => (
                <div key={template.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><p className="truncate text-xs font-semibold text-ink-900">{template.name}</p><p className="mt-1 text-[11px] text-ink-500">{INSPECTION_CHECKLIST_CATEGORY_LABELS[template.category] || template.category}</p></div>
                    <span className="shrink-0 rounded-full bg-petroleum-50 px-2 py-1 text-[10px] font-semibold text-petroleum-800">{template.itemCount} punkter</span>
                  </div>
                  {canManage ? <div className="mt-3 flex gap-2"><button type="button" onClick={() => openNewRound(template)} className={premiumCompactButtonClass}>Använd i rond</button><button type="button" onClick={() => openEditTemplate(template)} className={premiumCompactButtonClass}>Ändra</button></div> : null}
                </div>
              ))}
            </div>
          )}
        </Panel>
      </section>

      {roundModalOpen ? (
        <Modal title="Ny rond" description="Lägg in en ny kontroll i Revaltas rondplan." onClose={() => setRoundModalOpen(false)} maxWidth="max-w-2xl">
          <form onSubmit={createRound} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Rondens namn"><input required maxLength={200} value={roundForm.title} onChange={(event) => setRoundForm({ ...roundForm, title: event.target.value })} className={premiumFieldClass} placeholder="Exempel: Daglig tillsyn" /></Field>
              <Field label="Fastighet"><select required value={roundForm.propertyId} onChange={(event) => setRoundForm({ ...roundForm, propertyId: event.target.value })} className={premiumFieldClass}><option value="">Välj fastighet</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name} · {property.city}</option>)}</select></Field>
              <Field label="Rondtyp"><select value={roundForm.interval} onChange={(event) => setRoundForm({ ...roundForm, interval: event.target.value })} className={premiumFieldClass}>{Object.entries(intervalLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
              <Field label="Nästa datum"><input type="date" value={roundForm.nextDue} onChange={(event) => setRoundForm({ ...roundForm, nextDue: event.target.value })} className={premiumFieldClass} /><span className="mt-1.5 block text-[11px] text-ink-500">Om datum lämnas tomt räknas det automatiskt från intervallet.</span></Field>
            </div>
            <Field label="Checklista"><select value={roundForm.templateId} onChange={(event) => setRoundForm({ ...roundForm, templateId: event.target.value })} className={premiumFieldClass}><option value="">Egen checklista</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name} · {template.itemCount} punkter</option>)}</select></Field>
            {roundForm.templateId ? (
              <div className="rounded-xl border border-petroleum-100 bg-petroleum-50/50 p-4">
                <p className="text-xs font-semibold text-petroleum-900">{templates.find((template) => template.id === roundForm.templateId)?.name}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">{(templates.find((template) => template.id === roundForm.templateId)?.items || []).slice(0, 8).map((item) => <div key={item} className="flex items-start gap-2 text-xs text-ink-600"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-petroleum-600" />{item}</div>)}</div>
              </div>
            ) : <Field label="Kontrollpunkter"><textarea rows={7} value={roundForm.checklistText} onChange={(event) => setRoundForm({ ...roundForm, checklistText: event.target.value })} className={premiumTextareaClass} placeholder="En kontrollpunkt per rad" /><span className="mt-1.5 block text-[11px] text-ink-500">En kontrollpunkt per rad. Checklistan sparas i ronden.</span></Field>}
            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setRoundModalOpen(false)} className={premiumSecondaryButtonClass}>Avbryt</button><button disabled={savingRound} className={premiumPrimaryButtonClass}>{savingRound ? "Skapar rond…" : "Skapa rond"}</button></div>
          </form>
        </Modal>
      ) : null}

      {templateModalOpen ? (
        <Modal title={editingTemplateId ? "Ändra checklista" : "Ny checklista"} description="Skapa återanvändbara kontrollpunkter som kan kopplas till nya ronder." onClose={() => setTemplateModalOpen(false)} maxWidth="max-w-2xl">
          <form onSubmit={saveTemplate} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Namn"><input required maxLength={160} value={templateForm.name} onChange={(event) => setTemplateForm({ ...templateForm, name: event.target.value })} className={premiumFieldClass} placeholder="Exempel: Brandskyddsrond" /></Field>
              <Field label="Kategori"><select value={templateForm.category} onChange={(event) => setTemplateForm({ ...templateForm, category: event.target.value })} className={premiumFieldClass}>{templateCategories.map((category) => <option key={category} value={category}>{INSPECTION_CHECKLIST_CATEGORY_LABELS[category]}</option>)}</select></Field>
            </div>
            <Field label="Beskrivning"><input maxLength={600} value={templateForm.description} onChange={(event) => setTemplateForm({ ...templateForm, description: event.target.value })} className={premiumFieldClass} placeholder="Kort beskrivning av när checklistan används" /></Field>
            <Field label="Kontrollpunkter"><textarea required rows={10} value={templateForm.itemsText} onChange={(event) => setTemplateForm({ ...templateForm, itemsText: event.target.value })} className={premiumTextareaClass} placeholder="Kontrollera utrymningsvägar\nKontrollera branddörrar\nKontrollera skyltning" /><span className="mt-1.5 block text-[11px] text-ink-500">En kontrollpunkt per rad, högst 100 punkter.</span></Field>
            {editingTemplateId && confirmDeleteTemplate ? <InlineAlert tone="warning">Checklistan tas bort från mallbiblioteket. Redan skapade ronder behåller sina kontrollpunkter.</InlineAlert> : null}
            <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center sm:justify-between">
              <div>{editingTemplateId ? (confirmDeleteTemplate ? <button type="button" disabled={savingTemplate} onClick={() => void deleteTemplate()} className={premiumDangerButtonClass}><Trash2 className="mr-2 h-4 w-4" /> Bekräfta borttagning</button> : <button type="button" onClick={() => setConfirmDeleteTemplate(true)} className={premiumDangerButtonClass}><Trash2 className="mr-2 h-4 w-4" /> Ta bort</button>) : null}</div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row"><button type="button" onClick={() => setTemplateModalOpen(false)} className={premiumSecondaryButtonClass}>Avbryt</button><button disabled={savingTemplate} className={premiumPrimaryButtonClass}>{savingTemplate ? "Sparar…" : editingTemplateId ? "Spara ändringar" : "Skapa checklista"}</button></div>
            </div>
          </form>
        </Modal>
      ) : null}

      {selectedRound ? (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`Rond ${selectedRound.title || ""}`}>
          <button type="button" className="absolute inset-0 bg-ink-950/30 backdrop-blur-[1px]" onClick={() => setSelectedRoundId("")} aria-label="Stäng rond" />
          <aside className="absolute right-0 top-0 flex h-full w-full max-w-[620px] flex-col border-l border-sand-200 bg-[#FCFBF8] shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-sand-200 bg-white px-5 py-5 sm:px-6">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-petroleum-700">{selectedRound.propertyName || "Fastighet"}</p>
                <h2 className="mt-1 truncate font-display text-2xl font-semibold tracking-[-0.03em] text-ink-950">{selectedRound.title}</h2>
                <p className="mt-1 text-xs text-ink-500">{intervalLongLabels[selectedRound.interval || "monthly"]} · {selectedRound.nextDue ? `nästa ${dateFormat.format(new Date(selectedRound.nextDue))}` : "datum saknas"}</p>
              </div>
              <button type="button" onClick={() => setSelectedRoundId("")} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sand-200 bg-white text-ink-600 hover:bg-sand-50 focus-visible:ring-2 focus-visible:ring-petroleum-300" aria-label="Stäng"><X className="h-4 w-4" /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
              {selectedRound.source === "legacy" ? <InlineAlert tone="warning">Äldre rond – kör backfill innan kontrollpunkter och planering ändras.</InlineAlert> : null}
              <div className="grid gap-3 sm:grid-cols-3">
                <Mini label="Status" value={statusPill(selectedRound, nowMs).label} />
                <Mini label="Checklista" value={`${addressedCount(selectedRound)}/${selectedRound.checklist?.length || 0}`} />
                <Mini label="Avvikelser" value={String(selectedRound.deviations || 0)} />
              </div>

              {canManage && selectedRound.source !== "legacy" ? (
                <div className="mt-5 rounded-2xl border border-sand-200 bg-white p-4">
                  <button type="button" onClick={() => setEditingRoundFields((value) => !value)} className="flex w-full items-center justify-between text-left text-xs font-semibold text-ink-800"><span className="inline-flex items-center gap-2"><Pencil className="h-3.5 w-3.5 text-petroleum-700" /> Planering och intervall</span><span className="text-petroleum-700">{editingRoundFields ? "Stäng" : "Ändra"}</span></button>
                  {editingRoundFields ? <div className="mt-4 grid gap-3 sm:grid-cols-2"><input value={editRoundForm.title} onChange={(event) => setEditRoundForm({ ...editRoundForm, title: event.target.value })} className={`${premiumFieldClass} sm:col-span-2`} aria-label="Rondens namn" /><select value={editRoundForm.interval} onChange={(event) => setEditRoundForm({ ...editRoundForm, interval: event.target.value })} className={premiumFieldClass} aria-label="Intervall">{Object.entries(intervalLongLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input type="date" value={editRoundForm.nextDue} onChange={(event) => setEditRoundForm({ ...editRoundForm, nextDue: event.target.value })} className={premiumFieldClass} aria-label="Nästa datum" /><button type="button" disabled={savingId === selectedRound.id} onClick={() => void saveRoundFields(selectedRound)} className={`${premiumPrimaryButtonClass} sm:col-span-2`}>{savingId === selectedRound.id ? "Sparar…" : "Spara planering"}</button></div> : null}
                </div>
              ) : null}

              <div className="mt-6">
                <div className="flex items-end justify-between gap-3"><div><h3 className="font-display text-lg font-semibold text-ink-900">Checklista</h3><p className="mt-1 text-xs text-ink-500">Markera utförd kontroll eller registrera en avvikelse med anteckning.</p></div>{roundResult(selectedRound) !== null ? <span className="rounded-full bg-petroleum-50 px-3 py-1 text-xs font-bold text-petroleum-800">{roundResult(selectedRound)}%</span> : null}</div>
                <div className="mt-4 space-y-3">
                  {(selectedRound.checklist || []).map((item, index) => (
                    <div key={item.id} className={`rounded-2xl border p-4 ${item.hasDeviation ? "border-amber-200 bg-amber-50/40" : "border-sand-200 bg-white"}`}>
                      <div className="flex items-start gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sand-100 text-[10px] font-bold text-ink-500">{index + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-ink-900">{item.label}</p>
                          {canManage && selectedRound.source !== "legacy" ? (
                            <div className="mt-3 flex flex-wrap gap-4">
                              <label className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-700"><input type="checkbox" checked={item.completed} onChange={(event) => updateLocalChecklist(selectedRound.id, item.id, { completed: event.target.checked })} /> Utförd</label>
                              <label className="inline-flex items-center gap-2 text-xs font-semibold text-amber-800"><input type="checkbox" checked={item.hasDeviation} onChange={(event) => updateLocalChecklist(selectedRound.id, item.id, { hasDeviation: event.target.checked, note: event.target.checked ? item.note : "" })} /> Avvikelse</label>
                            </div>
                          ) : <div className="mt-2 flex gap-2">{item.completed ? <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">Utförd</span> : null}{item.hasDeviation ? <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800">Avvikelse</span> : null}</div>}
                          {item.hasDeviation && canManage && selectedRound.source !== "legacy" ? <textarea value={item.note} onChange={(event) => updateLocalChecklist(selectedRound.id, item.id, { note: event.target.value })} className={`${premiumTextareaClass} mt-3 min-h-20`} placeholder="Beskriv avvikelsen, plats och nästa steg" aria-label={`Avvikelse för ${item.label}`} /> : item.hasDeviation && item.note ? <p className="mt-3 text-xs leading-5 text-ink-600">{item.note}</p> : null}
                          {item.workOrderId ? <Link href={`/dashboard/arbetsorder/${item.workOrderId}`} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-petroleum-800 hover:text-petroleum-950"><Wrench className="h-3.5 w-3.5" /> Öppna arbetsorder</Link> : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {canManage && selectedRound.source !== "legacy" ? (
              <div className="border-t border-sand-200 bg-white px-5 py-4 sm:px-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button type="button" disabled={savingId === selectedRound.id} onClick={() => void saveChecklist(selectedRound)} className={premiumSecondaryButtonClass}>{savingId === selectedRound.id ? "Sparar…" : "Spara kontroll"}</button>
                  {openDeviationCount(selectedRound) > 0 ? <button type="button" disabled={savingId === selectedRound.id} onClick={() => void createWorkOrders(selectedRound)} className={premiumPrimaryButtonClass}><Wrench className="mr-2 h-4 w-4" /> Skapa arbetsorder ({openDeviationCount(selectedRound)})</button> : null}
                </div>
              </div>
            ) : null}
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function Modal({ title, description, onClose, maxWidth, children }: { title: string; description: string; onClose: () => void; maxWidth: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="absolute inset-0 bg-ink-950/30 backdrop-blur-[1px]" onClick={onClose} aria-label="Stäng dialog" />
      <div className={`relative max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-sand-200 bg-[#FCFBF8] shadow-2xl sm:rounded-3xl ${maxWidth}`}>
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-sand-200 bg-white/95 px-5 py-5 backdrop-blur sm:px-6">
          <div><h2 className="font-display text-xl font-semibold tracking-[-0.025em] text-ink-950">{title}</h2><p className="mt-1 text-sm leading-6 text-ink-500">{description}</p></div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sand-200 bg-white text-ink-600 hover:bg-sand-50 focus-visible:ring-2 focus-visible:ring-petroleum-300" aria-label="Stäng"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 sm:p-6">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-ink-700">{label}</span>{children}</label>;
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-sand-200 bg-white px-3.5 py-3"><p className="text-[10px] font-semibold uppercase tracking-[0.11em] text-ink-500">{label}</p><p className="mt-1.5 text-sm font-semibold text-ink-800">{value}</p></div>;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between rounded-xl border border-sand-200 bg-[#FCFBF8] px-3.5 py-3"><span className="text-xs text-ink-500">{label}</span><span className="text-sm font-semibold text-ink-900">{value}</span></div>;
}
