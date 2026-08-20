"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  ArrowRight,
  Building2,
  CalendarClock,
  Download,
  EyeOff,
  FileArchive,
  FileText,
  FolderOpen,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  UploadCloud,
  UsersRound,
  X,
} from "lucide-react";
import {
  EmptyState,
  InlineAlert,
  Panel,
  premiumFieldClass,
  premiumPrimaryButtonClass,
} from "@/components/dashboard/premium-ui";
import { readResponseJson } from "@/lib/fetch-json";

type Unit = { id: string; designation: string };
type Property = { id: string; name: string; address: string; city: string; units: Unit[] };
type Lease = {
  id: string;
  lease_number: string;
  status: string;
  property_id: string;
  unit_id: string;
  lease_holder: { name: string; contact_name: string | null };
  unit: { designation: string };
};
type LifecycleState = "active" | "unpublished" | "archived";
type Visibility = "internal" | "resident_all" | "resident_property" | "resident_unit" | "resident_lease";
type SortKey = "newest" | "oldest" | "name" | "expiry";
type FocusKey = "all" | "attention" | "resident" | "internal" | "archived";

type DocumentItem = {
  id: string;
  name: string;
  category: string;
  visibility: string;
  lifecycleState: LifecycleState;
  lifecycleChangedAt: string | null;
  validUntil: string | null;
  fileName: string | null;
  contentType: string | null;
  sizeBytes: number;
  downloadUrl: string;
  property: Property | null;
  unit: Unit | null;
  lease: { id: string; leaseNumber: string; status: string; holder: string; unit: string } | null;
  uploadedBy: string;
  createdAt: string;
  source?: "table" | "legacy";
};

type Payload = {
  documents: DocumentItem[];
  properties: Property[];
  leases: Lease[];
  canManageLifecycle: boolean;
  error?: string;
};

const categoryLabels: Record<string, string> = {
  contract: "Avtal",
  drawing: "Ritningar",
  inspection: "Besiktning",
  ovk: "OVK",
  sba: "SBA",
  energy: "Energi",
  insurance: "Försäkring",
  warranty: "Garanti",
  protocol: "Protokoll",
  notice: "Information",
  rules: "Ordningsregler",
  certificate: "Intyg",
  invoice: "Ekonomi",
  other: "Övrigt",
};

const categoryDescriptions: Record<string, string> = {
  contract: "Kontrakt och överenskommelser",
  drawing: "Planer, ritningar och underlag",
  inspection: "Kontroller och besiktningar",
  ovk: "Obligatorisk ventilationskontroll",
  sba: "Systematiskt brandskyddsarbete",
  energy: "Energideklarationer och underlag",
  insurance: "Försäkringshandlingar",
  warranty: "Garantier och produktunderlag",
  protocol: "Protokoll och möteshandlingar",
  notice: "Informationsdokument",
  rules: "Regler och boendeinformation",
  certificate: "Intyg och certifikat",
  invoice: "Ekonomiska dokument",
  other: "Övriga dokument",
};

const visibilityLabels: Record<Visibility, string> = {
  internal: "Endast internt",
  resident_all: "Alla boende",
  resident_property: "Boende i fastighet",
  resident_unit: "Boende i objekt",
  resident_lease: "Specifikt hyresavtal",
};

const visibilityDescriptions: Record<Visibility, string> = {
  internal: "Dokumentet visas endast för behöriga användare i Revalta.",
  resident_all: "Alla aktiva boendeavtal i organisationen får tillgång.",
  resident_property: "Aktiva boendeavtal i den valda fastigheten får tillgång.",
  resident_unit: "Endast aktiva avtal för det valda objektet får tillgång.",
  resident_lease: "Endast det valda aktiva hyresavtalet får tillgång.",
};

const lifecycleLabels: Record<LifecycleState, string> = {
  active: "Aktivt",
  unpublished: "Avpublicerat",
  archived: "Arkiverat",
};

const dateFormatter = new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short", year: "numeric" });
const fullDateFormatter = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" });

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "Okänd storlek";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} kB`;
  return `${(value / (1024 * 1024)).toLocaleString("sv-SE", { maximumFractionDigits: 1 })} MB`;
}

function daysUntil(value: string | null) {
  if (!value) return null;
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

function lifecycleTone(state: LifecycleState) {
  if (state === "active") return "bg-emerald-50 text-emerald-700 ring-emerald-100";
  if (state === "unpublished") return "bg-amber-50 text-amber-800 ring-amber-100";
  return "bg-sand-100 text-ink-650 ring-sand-200";
}

function visibilityTone(visibility: string) {
  return visibility === "internal"
    ? "bg-sand-100 text-ink-650 ring-sand-200"
    : "bg-petroleum-50 text-petroleum-800 ring-petroleum-100";
}

function escapeCsv(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export default function DocumentsPage() {
  const router = useRouter();
  const [data, setData] = useState<Payload>({ documents: [], properties: [], leases: [], canManageLifecycle: false });
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState("");
  const [lifecycleFilter, setLifecycleFilter] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [focus, setFocus] = useState<FocusKey>("all");
  const [showUpload, setShowUpload] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("other");
  const [visibility, setVisibility] = useState<Visibility>("internal");
  const [propertyId, setPropertyId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [leaseId, setLeaseId] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [changingId, setChangingId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editForm, setEditForm] = useState({ name: "", category: "other", validUntil: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/documents", { cache: "no-store" });
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      const payload = await readResponseJson<Payload>(response);
      if (!response.ok) throw new Error(payload.error || "Kunde inte hämta dokument");
      setData({
        documents: payload.documents || [],
        properties: payload.properties || [],
        leases: payload.leases || [],
        canManageLifecycle: Boolean(payload.canManageLifecycle),
      });
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte hämta dokument");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const selectedProperty = data.properties.find((property) => property.id === propertyId) || null;
  const availableUnits = selectedProperty?.units || [];
  const availableLeases = data.leases.filter((lease) => visibility !== "resident_unit" || lease.unit_id === unitId);

  const activeCount = data.documents.filter((item) => item.lifecycleState === "active").length;
  const residentPublished = data.documents.filter((item) => item.lifecycleState === "active" && item.visibility !== "internal").length;
  const archivedCount = data.documents.filter((item) => item.lifecycleState === "archived").length;
  const unpublishedCount = data.documents.filter((item) => item.lifecycleState === "unpublished").length;
  const attentionCount = data.documents.filter((item) => {
    const days = daysUntil(item.validUntil);
    return item.lifecycleState === "active" && days !== null && days <= 60;
  }).length;

  const categoryRows = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of data.documents) {
      if (item.lifecycleState === "archived") continue;
      counts.set(item.category || "other", (counts.get(item.category || "other") || 0) + 1);
    }
    return [...counts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 7);
  }, [data.documents]);

  const propertyRows = useMemo(() => {
    const counts = new Map<string, { id: string; name: string; count: number }>();
    for (const item of data.documents) {
      if (!item.property || item.lifecycleState === "archived") continue;
      const current = counts.get(item.property.id) || { id: item.property.id, name: item.property.name, count: 0 };
      current.count += 1;
      counts.set(item.property.id, current);
    }
    return [...counts.values()].sort((left, right) => right.count - left.count).slice(0, 5);
  }, [data.documents]);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("sv-SE");
    const rows = data.documents.filter((item) => {
      const expiry = daysUntil(item.validUntil);
      const text = [
        item.name,
        item.fileName,
        item.property?.name,
        item.property?.address,
        item.unit?.designation,
        item.lease?.leaseNumber,
        item.lease?.holder,
        item.uploadedBy,
        categoryLabels[item.category],
      ].filter(Boolean).join(" ").toLocaleLowerCase("sv-SE");

      const focusMatch = focus === "all"
        || (focus === "attention" && item.lifecycleState === "active" && expiry !== null && expiry <= 60)
        || (focus === "resident" && item.lifecycleState === "active" && item.visibility !== "internal")
        || (focus === "internal" && item.lifecycleState === "active" && item.visibility === "internal")
        || (focus === "archived" && item.lifecycleState === "archived");

      return focusMatch
        && (!query || text.includes(query))
        && (!categoryFilter || item.category === categoryFilter)
        && (!propertyFilter || item.property?.id === propertyFilter)
        && (!visibilityFilter || item.visibility === visibilityFilter)
        && (!lifecycleFilter || item.lifecycleState === lifecycleFilter);
    });

    return [...rows].sort((left, right) => {
      if (sort === "name") return left.name.localeCompare(right.name, "sv");
      if (sort === "oldest") return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      if (sort === "expiry") {
        const leftTime = left.validUntil ? new Date(left.validUntil).getTime() : Number.MAX_SAFE_INTEGER;
        const rightTime = right.validUntil ? new Date(right.validUntil).getTime() : Number.MAX_SAFE_INTEGER;
        return leftTime - rightTime;
      }
      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    });
  }, [data.documents, search, categoryFilter, propertyFilter, visibilityFilter, lifecycleFilter, focus, sort]);

  const recentDocuments = useMemo(
    () => [...data.documents].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 4),
    [data.documents],
  );

  const attentionDocuments = useMemo(
    () => data.documents
      .filter((item) => {
        const days = daysUntil(item.validUntil);
        return item.lifecycleState === "active" && days !== null && days <= 60;
      })
      .sort((a, b) => (daysUntil(a.validUntil) ?? 9999) - (daysUntil(b.validUntil) ?? 9999))
      .slice(0, 5),
    [data.documents],
  );

  const filtersActive = Boolean(search || categoryFilter || propertyFilter || visibilityFilter || lifecycleFilter || focus !== "all");

  function changeVisibility(next: Visibility) {
    setVisibility(next);
    setPropertyId("");
    setUnitId("");
    setLeaseId("");
  }

  function resetForm() {
    setName("");
    setCategory("other");
    setVisibility("internal");
    setPropertyId("");
    setUnitId("");
    setLeaseId("");
    setValidUntil("");
    setFile(null);
  }

  function resetFilters() {
    setSearch("");
    setCategoryFilter("");
    setPropertyFilter("");
    setVisibilityFilter("");
    setLifecycleFilter("");
    setFocus("all");
    setSort("newest");
  }

  function exportMetadata() {
    const rows = [
      ["Dokument", "Kategori", "Status", "Synlighet", "Fastighet", "Objekt", "Avtal", "Giltigt till", "Uppladdad", "Uppladdad av", "Filstorlek"],
      ...filtered.map((item) => [
        item.name,
        categoryLabels[item.category] || item.category,
        lifecycleLabels[item.lifecycleState],
        visibilityLabels[item.visibility as Visibility] || item.visibility,
        item.property?.name || "",
        item.unit?.designation || "",
        item.lease?.leaseNumber || "",
        item.validUntil || "",
        item.createdAt.slice(0, 10),
        item.uploadedBy,
        formatBytes(item.sizeBytes),
      ]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(escapeCsv).join(";")).join("\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `revalta-dokument-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function uploadDocument(event: React.FormEvent) {
    event.preventDefault();
    if (!file) {
      setError("Välj en fil");
      return;
    }
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", name);
      formData.append("category", category);
      formData.append("visibility", visibility);
      formData.append("propertyId", propertyId);
      formData.append("unitId", unitId);
      formData.append("leaseId", leaseId);
      formData.append("validUntil", validUntil);
      const response = await fetch("/api/documents", { method: "POST", body: formData });
      const payload = await readResponseJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(payload.error || "Kunde inte ladda upp dokumentet");
      resetForm();
      setShowUpload(false);
      setMessage("Dokumentet har sparats och är tillgängligt enligt vald åtkomstnivå.");
      await loadDocuments();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte ladda upp dokumentet");
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(item: DocumentItem) {
    if (item.source === "legacy") {
      setError("Dokumentet finns i äldre lagring. Kör backfill till ManagedDocument innan det kan ändras.");
      return;
    }
    if (item.lifecycleState === "archived") {
      setError("Arkiverade dokument kan inte redigeras. Återställ dokumentet först.");
      return;
    }
    setEditingId(item.id);
    setEditForm({ name: item.name, category: item.category || "other", validUntil: item.validUntil || "" });
    setError("");
  }

  async function saveEdit(item: DocumentItem) {
    setChangingId(item.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/documents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: item.id,
          name: editForm.name,
          category: editForm.category,
          validUntil: editForm.validUntil,
        }),
      });
      const payload = await readResponseJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(payload.error || "Kunde inte uppdatera dokumentet");
      setEditingId("");
      setMessage("Dokumentet har uppdaterats.");
      await loadDocuments();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte uppdatera dokumentet");
    } finally {
      setChangingId("");
    }
  }

  async function changeLifecycle(item: DocumentItem, transition: "archive" | "unpublish" | "restore") {
    if (item.source === "legacy") {
      setError("Dokumentet finns i äldre lagring. Kör backfill till ManagedDocument innan livscykeln ändras.");
      return;
    }
    const labels = { archive: "arkivera", unpublish: "avpublicera", restore: "återställa" };
    if (!window.confirm(`Vill du ${labels[transition]} dokumentet ”${item.name}”?`)) return;
    setChangingId(item.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/documents/${item.id}/lifecycle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transition }),
      });
      const payload = await readResponseJson<{ error?: string; state?: LifecycleState }>(response);
      if (!response.ok) throw new Error(payload.error || "Kunde inte ändra dokumentstatus");
      setMessage(`Dokumentet är nu ${payload.state ? lifecycleLabels[payload.state].toLowerCase() : "uppdaterat"}.`);
      await loadDocuments();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte ändra dokumentstatus");
    } finally {
      setChangingId("");
    }
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-petroleum-700">Dokument & fastighetspärm / Översikt</p>
          <h1 className="mt-1 font-display text-[30px] font-semibold tracking-[-0.045em] text-ink-950 sm:text-[34px]">Dokument</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-500">Ett lugnt och spårbart dokumentarkiv för fastigheter, avtal, besiktningar och boendeinformation.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-10 items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 text-[11px] font-semibold text-emerald-800">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" /> Live-data
          </span>
          <button type="button" onClick={exportMetadata} disabled={!filtered.length} className="inline-flex h-10 items-center gap-2 rounded-xl border border-sand-200 bg-white px-3.5 text-[11px] font-semibold text-ink-700 transition hover:border-petroleum-200 hover:text-petroleum-800 disabled:cursor-not-allowed disabled:opacity-50">
            <Download className="h-4 w-4" /> Exportera CSV
          </button>
          {data.canManageLifecycle ? (
            <button type="button" onClick={() => setShowUpload((current) => !current)} className={premiumPrimaryButtonClass}>
              {showUpload ? <X className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
              {showUpload ? "Stäng uppladdning" : "Nytt dokument"}
            </button>
          ) : null}
        </div>
      </header>

      <nav className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Snabbvägar från dokument">
        <QuickLink href="/dashboard/fastigheter" icon={Building2} label="Fastigheter" detail="Öppna fastighetskort" />
        <QuickLink href="/dashboard/uthyrning" icon={UsersRound} label="Uthyrning" detail="Avtal och hyresparter" />
        <QuickLink href="/dashboard/rapporter" icon={FileArchive} label="Rapporter" detail="Beslutsunderlag" />
        <QuickLink href="/dashboard" icon={ArrowRight} label="Översikt" detail="Till huvud-dashboard" />
      </nav>

      {error ? <InlineAlert>{error}</InlineAlert> : null}
      {message ? <InlineAlert tone="success">{message}</InlineAlert> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Aktiva dokument" value={loading ? "—" : activeCount} detail={`${data.documents.length} totalt`} active={focus === "all" && !lifecycleFilter} onClick={() => { setFocus("all"); setLifecycleFilter("active"); }} />
        <StatCard label="Publicerade till boende" value={loading ? "—" : residentPublished} detail="Aktiva externa målgrupper" active={focus === "resident"} onClick={() => { setFocus("resident"); setLifecycleFilter(""); }} />
        <StatCard label="Behöver uppmärksamhet" value={loading ? "—" : attentionCount} detail="Går ut inom 60 dagar" active={focus === "attention"} warning={attentionCount > 0} onClick={() => { setFocus("attention"); setLifecycleFilter(""); }} />
        <StatCard label="Avpublicerade" value={loading ? "—" : unpublishedCount} detail="Dolda från boende" active={lifecycleFilter === "unpublished"} onClick={() => { setFocus("all"); setLifecycleFilter("unpublished"); }} />
        <StatCard label="Arkiverade" value={loading ? "—" : archivedCount} detail="Bevarade i historiken" active={focus === "archived"} onClick={() => { setFocus("archived"); setLifecycleFilter(""); }} />
      </section>

      {showUpload && data.canManageLifecycle ? (
        <Panel title="Lägg till dokument" description="PDF, bild, Word eller Excel. Max 2 MB. Åtkomsten kontrolleras vid varje nedladdning.">
          <form onSubmit={uploadDocument} className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block"><FieldLabel>Dokumentnamn</FieldLabel><input required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} className={premiumFieldClass} placeholder="Exempel: Energideklaration 2026" /></label>
                <label className="block"><FieldLabel>Kategori</FieldLabel><select value={category} onChange={(event) => setCategory(event.target.value)} className={premiumFieldClass}>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block"><FieldLabel>Synlighet</FieldLabel><select value={visibility} onChange={(event) => changeVisibility(event.target.value as Visibility)} className={premiumFieldClass}>{Object.entries(visibilityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label className="block"><FieldLabel>Giltigt till</FieldLabel><input type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} className={premiumFieldClass} /></label>
              </div>
              {(visibility === "resident_property" || visibility === "resident_unit") ? (
                <label className="block"><FieldLabel>Fastighet</FieldLabel><select required value={propertyId} onChange={(event) => { setPropertyId(event.target.value); setUnitId(""); }} className={premiumFieldClass}><option value="">Välj fastighet</option>{data.properties.map((property) => <option key={property.id} value={property.id}>{property.name} · {property.address}</option>)}</select></label>
              ) : null}
              {visibility === "resident_unit" ? (
                <label className="block"><FieldLabel>Objekt</FieldLabel><select required disabled={!propertyId} value={unitId} onChange={(event) => setUnitId(event.target.value)} className={premiumFieldClass}><option value="">Välj objekt</option>{availableUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.designation}</option>)}</select></label>
              ) : null}
              {visibility === "resident_lease" ? (
                <label className="block"><FieldLabel>Hyresavtal</FieldLabel><select required value={leaseId} onChange={(event) => setLeaseId(event.target.value)} className={premiumFieldClass}><option value="">Välj avtal</option>{availableLeases.map((lease) => <option key={lease.id} value={lease.id}>{lease.lease_number} · {lease.unit.designation} · {lease.lease_holder.contact_name || lease.lease_holder.name}</option>)}</select></label>
              ) : null}
            </div>
            <div className="space-y-4">
              <div className="rounded-2xl border border-petroleum-100 bg-petroleum-50/60 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-petroleum-700">Åtkomst</p>
                <p className="mt-1 text-sm font-semibold text-petroleum-950">{visibilityLabels[visibility]}</p>
                <p className="mt-1 text-xs leading-5 text-petroleum-800">{visibilityDescriptions[visibility]}</p>
              </div>
              <label className="block rounded-2xl border border-dashed border-sand-300 bg-[#FCFBF8] p-5 text-center transition hover:border-petroleum-300">
                <UploadCloud className="mx-auto h-6 w-6 text-petroleum-700" />
                <span className="mt-2 block text-sm font-semibold text-ink-800">Välj dokument</span>
                <span className="mt-1 block text-xs text-ink-500">PDF, JPG, PNG, DOCX eller XLSX · max 2 MB</span>
                <input required type="file" accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx" onChange={(event) => setFile(event.target.files?.[0] || null)} className="mt-4 block w-full text-xs text-ink-600 file:mr-3 file:rounded-lg file:border-0 file:bg-sand-100 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-ink-700" />
                {file ? <span className="mt-2 block text-xs font-medium text-petroleum-800">{file.name} · {formatBytes(file.size)}</span> : null}
              </label>
              <button disabled={submitting} className={`${premiumPrimaryButtonClass} w-full justify-center`}>
                {submitting ? "Sparar dokument…" : "Spara dokument"}
              </button>
            </div>
          </form>
        </Panel>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <article className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm">
          <div className="flex items-center justify-between gap-4">
            <div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-petroleum-700">Digital fastighetspärm</p><h2 className="mt-1 font-display text-lg font-semibold text-ink-950">Dokumentområden</h2></div>
            <p className="text-[11px] text-ink-500">{activeCount - unpublishedCount} aktiva i biblioteket</p>
          </div>
          {categoryRows.length ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {categoryRows.map(([key, count]) => (
                <button key={key} type="button" onClick={() => { setCategoryFilter(key); setFocus("all"); setLifecycleFilter(""); }} className={`group flex min-h-20 items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition ${categoryFilter === key ? "border-petroleum-200 bg-petroleum-50" : "border-sand-200 bg-[#FCFBF8] hover:border-petroleum-200 hover:bg-white"}`}>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-petroleum-700 ring-1 ring-sand-200"><FolderOpen className="h-4 w-4" /></span>
                  <span className="min-w-0"><span className="block text-sm font-semibold text-ink-850">{categoryLabels[key] || key}</span><span className="mt-0.5 block truncate text-[10px] text-ink-500">{categoryDescriptions[key] || "Dokument"}</span></span>
                  <span className="ml-auto text-xs font-semibold text-ink-500">{count}</span>
                </button>
              ))}
            </div>
          ) : <EmptyState title="Inga dokumentområden ännu" description="När dokument laddas upp visas de automatiskt här." />}
        </article>

        <article className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm">
          <div className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-petroleum-700" /><h2 className="font-display text-lg font-semibold text-ink-950">Dokumentsignal</h2></div>
          <div className="mt-4 space-y-2.5">
            <SignalRow label="Aktiva" value={activeCount} detail="i dokumentarkivet" />
            <SignalRow label="Boendepublicerade" value={residentPublished} detail="extern åtkomst" />
            <SignalRow label="Går ut inom 60 dagar" value={attentionCount} detail="kräver kontroll" warning={attentionCount > 0} />
            <SignalRow label="Arkiverade" value={archivedCount} detail="historik" />
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_310px]">
        <Panel title="Dokumentbibliotek" description={`${filtered.length} dokument matchar aktuell vy`} bodyClassName="p-0">
          <div className="border-b border-sand-200 p-4 sm:p-5">
            <div className="grid gap-2 xl:grid-cols-[1fr_145px_165px_155px_145px]">
              <label className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-300" /><input value={search} onChange={(event) => setSearch(event.target.value)} className={`${premiumFieldClass} pl-9`} placeholder="Sök dokument, fastighet, objekt eller avtal" aria-label="Sök dokument" /></label>
              <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className={premiumFieldClass} aria-label="Kategori"><option value="">Alla kategorier</option>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
              <select value={propertyFilter} onChange={(event) => setPropertyFilter(event.target.value)} className={premiumFieldClass} aria-label="Fastighet"><option value="">Alla fastigheter</option>{data.properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select>
              <select value={visibilityFilter} onChange={(event) => setVisibilityFilter(event.target.value)} className={premiumFieldClass} aria-label="Synlighet"><option value="">All synlighet</option>{Object.entries(visibilityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
              <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)} className={premiumFieldClass} aria-label="Sortering"><option value="newest">Nyast först</option><option value="oldest">Äldst först</option><option value="name">Namn A–Ö</option><option value="expiry">Giltighetstid</option></select>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <SlidersHorizontal className="h-3.5 w-3.5 text-ink-400" />
              <FocusButton active={focus === "all" && !lifecycleFilter} onClick={() => { setFocus("all"); setLifecycleFilter(""); }}>Alla</FocusButton>
              <FocusButton active={focus === "attention"} onClick={() => { setFocus("attention"); setLifecycleFilter(""); }}>Behöver uppmärksamhet</FocusButton>
              <FocusButton active={focus === "resident"} onClick={() => { setFocus("resident"); setLifecycleFilter(""); }}>Publicerade</FocusButton>
              <FocusButton active={focus === "internal"} onClick={() => { setFocus("internal"); setLifecycleFilter(""); }}>Internt</FocusButton>
              <FocusButton active={lifecycleFilter === "unpublished"} onClick={() => { setFocus("all"); setLifecycleFilter("unpublished"); }}>Avpublicerade</FocusButton>
              <FocusButton active={focus === "archived"} onClick={() => { setFocus("archived"); setLifecycleFilter(""); }}>Arkiv</FocusButton>
              {filtersActive ? <button type="button" onClick={resetFilters} className="ml-auto text-[11px] font-semibold text-petroleum-700 transition hover:text-petroleum-950">Rensa filter</button> : null}
            </div>
          </div>

          {loading ? (
            <div className="space-y-3 p-6">{[1, 2, 3, 4].map((item) => <div key={item} className="h-28 animate-pulse rounded-xl bg-sand-100" />)}</div>
          ) : filtered.length === 0 ? (
            <EmptyState title="Inga dokument matchar" description="Justera sökningen eller filtreringen, eller ladda upp ett nytt dokument." />
          ) : (
            <div className="divide-y divide-sand-100">
              {filtered.map((item) => {
                const scope = item.lease
                  ? `${item.lease.leaseNumber} · ${item.lease.unit} · ${item.lease.holder}`
                  : item.unit
                    ? `${item.property?.name || "Fastighet"} · ${item.unit.designation}`
                    : item.property?.name || visibilityLabels[item.visibility as Visibility] || item.visibility;
                const expiry = daysUntil(item.validUntil);
                const expired = expiry !== null && expiry < 0;
                const expiresSoon = expiry !== null && expiry >= 0 && expiry <= 60;
                const inactive = item.lifecycleState !== "active";

                return (
                  <article key={item.id} className={`p-4 transition sm:p-5 ${inactive ? "bg-sand-50/55" : "hover:bg-[#FCFBF8]"}`}>
                    <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
                      <div className="flex min-w-0 items-start gap-3.5">
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sand-50 text-petroleum-700 ring-1 ring-sand-200"><FileText className="h-4.5 w-4.5" /></div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <h3 className="mr-1 font-semibold text-ink-950">{item.name}</h3>
                            <Badge className="bg-sand-100 text-ink-650 ring-sand-200">{categoryLabels[item.category] || item.category}</Badge>
                            <Badge className={visibilityTone(item.visibility)}>{visibilityLabels[item.visibility as Visibility] || item.visibility}</Badge>
                            <Badge className={lifecycleTone(item.lifecycleState)}>{lifecycleLabels[item.lifecycleState]}</Badge>
                            {expired ? <Badge className="bg-red-50 text-red-700 ring-red-100">Utgånget</Badge> : expiresSoon ? <Badge className="bg-amber-50 text-amber-800 ring-amber-100">Går ut om {expiry} dagar</Badge> : null}
                          </div>
                          <p className="mt-1.5 text-sm text-ink-600">{scope}</p>
                          <p className="mt-1 text-[11px] leading-5 text-ink-500">{item.fileName || "Fil"} · {formatBytes(item.sizeBytes)} · uppladdat {dateFormatter.format(new Date(item.createdAt))} av {item.uploadedBy}</p>
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                            {item.property ? <Link href={`/dashboard/fastigheter/${item.property.id}`} className="font-semibold text-petroleum-700 hover:text-petroleum-950">Öppna {item.property.name}</Link> : null}
                            {item.lease ? <Link href="/dashboard/uthyrning" className="font-semibold text-petroleum-700 hover:text-petroleum-950">Öppna uthyrning</Link> : null}
                            {item.validUntil ? <span className={expired || expiresSoon ? "font-semibold text-amber-800" : "text-ink-500"}>Giltigt till {fullDateFormatter.format(new Date(item.validUntil))}</span> : null}
                          </div>
                          {item.source === "legacy" ? <p className="mt-2 text-[11px] font-medium text-amber-800">Äldre lagringsrad · backfill krävs innan dokumentet kan ändras.</p> : null}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {item.downloadUrl && item.lifecycleState !== "archived" ? <a href={item.downloadUrl} className="inline-flex h-9 items-center gap-2 rounded-lg border border-sand-200 bg-white px-3 text-[11px] font-semibold text-ink-700 transition hover:border-petroleum-200 hover:text-petroleum-800"><Download className="h-3.5 w-3.5" /> Hämta</a> : null}
                        {item.source !== "legacy" && item.lifecycleState !== "archived" ? <button type="button" onClick={() => editingId === item.id ? setEditingId("") : startEdit(item)} className="inline-flex h-9 items-center rounded-lg border border-sand-200 bg-white px-3 text-[11px] font-semibold text-ink-700 transition hover:border-petroleum-200 hover:text-petroleum-800">{editingId === item.id ? "Stäng" : "Ändra"}</button> : null}
                        {item.source !== "legacy" && data.canManageLifecycle && item.lifecycleState === "active" && item.visibility !== "internal" ? <button type="button" disabled={changingId === item.id} onClick={() => void changeLifecycle(item, "unpublish")} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-200 bg-white px-3 text-[11px] font-semibold text-amber-800 transition hover:bg-amber-50 disabled:opacity-50"><EyeOff className="h-3.5 w-3.5" /> Avpublicera</button> : null}
                        {item.source !== "legacy" && data.canManageLifecycle && item.lifecycleState !== "archived" ? <button type="button" disabled={changingId === item.id} onClick={() => void changeLifecycle(item, "archive")} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-sand-200 bg-white px-3 text-[11px] font-semibold text-ink-650 transition hover:bg-sand-50 disabled:opacity-50"><Archive className="h-3.5 w-3.5" /> Arkivera</button> : null}
                        {item.source !== "legacy" && data.canManageLifecycle && item.lifecycleState !== "active" ? <button type="button" disabled={changingId === item.id} onClick={() => void changeLifecycle(item, "restore")} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-petroleum-800 px-3 text-[11px] font-semibold text-white transition hover:bg-petroleum-900 disabled:opacity-50"><RotateCcw className="h-3.5 w-3.5" /> Återställ</button> : null}
                      </div>
                    </div>

                    {editingId === item.id ? (
                      <div className="mt-4 grid gap-3 rounded-xl border border-sand-200 bg-[#FCFBF8] p-4 md:grid-cols-[1fr_190px_180px_auto]">
                        <input className={premiumFieldClass} value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} placeholder="Dokumentnamn" aria-label="Dokumentnamn" />
                        <select className={premiumFieldClass} value={editForm.category} onChange={(event) => setEditForm({ ...editForm, category: event.target.value })} aria-label="Kategori">{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                        <input className={premiumFieldClass} type="date" value={editForm.validUntil} onChange={(event) => setEditForm({ ...editForm, validUntil: event.target.value })} aria-label="Giltigt till" />
                        <button type="button" disabled={changingId === item.id} onClick={() => void saveEdit(item)} className="rounded-xl bg-petroleum-800 px-4 text-xs font-semibold text-white transition hover:bg-petroleum-900 disabled:opacity-50">{changingId === item.id ? "Sparar…" : "Spara"}</button>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </Panel>

        <aside className="space-y-4">
          <article className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm">
            <div className="flex items-center gap-2"><AlertTriangle className={`h-4 w-4 ${attentionDocuments.length ? "text-amber-700" : "text-petroleum-700"}`} /><h2 className="font-display text-base font-semibold text-ink-950">Behöver uppmärksamhet</h2></div>
            <p className="mt-1 text-[11px] leading-5 text-ink-500">Giltighetstid som passerat eller löper ut inom 60 dagar.</p>
            <div className="mt-4 divide-y divide-sand-100">
              {attentionDocuments.length ? attentionDocuments.map((item) => {
                const days = daysUntil(item.validUntil);
                return <button key={item.id} type="button" onClick={() => { setFocus("attention"); setSearch(item.name); }} className="flex w-full items-center justify-between gap-3 py-3 text-left transition hover:text-petroleum-800"><span className="min-w-0"><span className="block truncate text-xs font-semibold text-ink-800">{item.name}</span><span className="mt-0.5 block truncate text-[10px] text-ink-500">{item.property?.name || categoryLabels[item.category] || "Dokument"}</span></span><span className={`shrink-0 text-[10px] font-semibold ${days !== null && days < 0 ? "text-red-700" : "text-amber-800"}`}>{days !== null && days < 0 ? `${Math.abs(days)} d sent` : `${days} d`}</span></button>;
              }) : <p className="py-4 text-xs leading-5 text-ink-500">Inga aktiva dokument kräver uppföljning just nu.</p>}
            </div>
          </article>

          <article className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm">
            <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-petroleum-700" /><h2 className="font-display text-base font-semibold text-ink-950">Senast uppladdat</h2></div>
            <div className="mt-4 divide-y divide-sand-100">
              {recentDocuments.length ? recentDocuments.map((item) => <button key={item.id} type="button" onClick={() => { setSearch(item.name); setFocus("all"); setLifecycleFilter(""); }} className="w-full py-3 text-left"><p className="truncate text-xs font-semibold text-ink-800">{item.name}</p><p className="mt-0.5 text-[10px] text-ink-500">{dateFormatter.format(new Date(item.createdAt))} · {categoryLabels[item.category] || item.category}</p></button>) : <p className="py-4 text-xs text-ink-500">Inga dokument ännu.</p>}
            </div>
          </article>

          <article className="rounded-2xl border border-sand-200 bg-[#F4F1EA] p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-petroleum-700">Fastighetspärmar</p>
            <h2 className="mt-1 font-display text-base font-semibold text-ink-950">Mest dokumenterade</h2>
            <div className="mt-3 space-y-2">
              {propertyRows.length ? propertyRows.map((property) => <button key={property.id} type="button" onClick={() => setPropertyFilter(property.id)} className="flex w-full items-center justify-between rounded-xl border border-sand-200 bg-white/75 px-3 py-2.5 text-left transition hover:border-petroleum-200"><span className="truncate text-xs font-semibold text-ink-750">{property.name}</span><span className="text-[10px] font-semibold text-ink-500">{property.count}</span></button>) : <p className="text-xs leading-5 text-ink-500">Koppla dokument till fastigheter för att bygga upp digitala fastighetspärmar.</p>}
            </div>
          </article>
        </aside>
      </section>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="mb-1.5 block text-xs font-semibold text-ink-700">{children}</span>;
}

function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.05em] ring-1 ring-inset ${className}`}>{children}</span>;
}

function FocusButton({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`rounded-lg px-2.5 py-1.5 text-[10px] font-semibold transition ${active ? "bg-petroleum-800 text-white" : "bg-sand-50 text-ink-600 hover:bg-sand-100 hover:text-ink-900"}`}>{children}</button>;
}

function StatCard({ label, value, detail, active, warning = false, onClick }: { label: string; value: number | string; detail: string; active?: boolean; warning?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-2xl border bg-white p-4 text-left shadow-premium-sm transition hover:-translate-y-0.5 hover:shadow-premium ${active ? "border-petroleum-200 ring-2 ring-petroleum-50" : warning ? "border-amber-200" : "border-sand-200"}`}>
      <p className="text-[11px] font-medium text-ink-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tracking-[-0.035em] ${warning ? "text-amber-800" : "text-ink-950"}`}>{value}</p>
      <p className="mt-1.5 text-[10px] text-ink-500">{detail}</p>
    </button>
  );
}

function SignalRow({ label, value, detail, warning = false }: { label: string; value: number; detail: string; warning?: boolean }) {
  return <div className="flex items-center justify-between rounded-xl border border-sand-200 bg-[#FCFBF8] px-3.5 py-3"><div><p className="text-xs font-semibold text-ink-750">{label}</p><p className="mt-0.5 text-[10px] text-ink-500">{detail}</p></div><span className={`text-sm font-semibold ${warning ? "text-amber-800" : "text-ink-950"}`}>{value}</span></div>;
}

function QuickLink({ href, icon: Icon, label, detail }: { href: string; icon: typeof Building2; label: string; detail: string }) {
  return <Link href={href} className="group flex items-center gap-3 rounded-xl border border-sand-200 bg-white px-3.5 py-3 shadow-premium-sm transition hover:border-petroleum-200 hover:shadow-premium"><span className="grid h-9 w-9 place-items-center rounded-lg bg-sand-50 text-petroleum-700"><Icon className="h-4 w-4" /></span><span><span className="block text-xs font-semibold text-ink-800">{label}</span><span className="mt-0.5 block text-[10px] text-ink-500">{detail}</span></span><ArrowRight className="ml-auto h-3.5 w-3.5 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-petroleum-700" /></Link>;
}
