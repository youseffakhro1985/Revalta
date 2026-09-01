"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Archive,
  ArrowRight,
  Building2,
  Download,
  EyeOff,
  FileArchive,
  FileText,
  FolderOpen,
  Pencil,
  Plus,
  RotateCcw,
  Search,
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

type Summary = {
  total: number;
  active: number;
  unpublished: number;
  archived: number;
  residentPublished: number;
  attention: number;
};

type Payload = {
  documents: DocumentItem[];
  properties: Property[];
  leases: Lease[];
  summary: Summary;
  categoryRows: Array<{ category: string; count: number }>;
  propertyRows: Array<{ id: string; name: string; count: number }>;
  recentDocuments: DocumentItem[];
  attentionDocuments: DocumentItem[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  canManageLifecycle: boolean;
  error?: string;
};

type LegacyPayload = {
  documents?: DocumentItem[];
  properties?: Property[];
  leases?: Lease[];
  canManageLifecycle?: boolean;
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

const visibilityLabels: Record<Visibility, string> = {
  internal: "Endast internt",
  resident_all: "Alla boende",
  resident_property: "Boende i fastighet",
  resident_unit: "Boende i objekt",
  resident_lease: "Specifikt hyresavtal",
};

const lifecycleLabels: Record<LifecycleState, string> = {
  active: "Aktivt",
  unpublished: "Avpublicerat",
  archived: "Arkiverat",
};

const EMPTY_SUMMARY: Summary = {
  total: 0,
  active: 0,
  unpublished: 0,
  archived: 0,
  residentPublished: 0,
  attention: 0,
};

const EMPTY_PAYLOAD: Payload = {
  documents: [],
  properties: [],
  leases: [],
  summary: EMPTY_SUMMARY,
  categoryRows: [],
  propertyRows: [],
  recentDocuments: [],
  attentionDocuments: [],
  pagination: { page: 1, pageSize: 25, total: 0, totalPages: 1 },
  canManageLifecycle: false,
};

const dateFormatter = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" });

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

function escapeCsv(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function buildLegacyPayload(
  raw: LegacyPayload,
  options: {
    page: number;
    pageSize: number;
    search: string;
    category: string;
    propertyId: string;
    visibility: string;
    lifecycle: string;
    sort: SortKey;
    focus: FocusKey;
  },
): Payload {
  const all = raw.documents || [];
  const normalizedSearch = options.search.trim().toLocaleLowerCase("sv-SE");
  const filtered = all.filter((item) => {
    const expiry = daysUntil(item.validUntil);
    const haystack = [
      item.name,
      item.fileName,
      item.property?.name,
      item.property?.address,
      item.property?.city,
      item.unit?.designation,
      item.lease?.leaseNumber,
      item.lease?.holder,
      item.uploadedBy,
    ].filter(Boolean).join(" ").toLocaleLowerCase("sv-SE");
    const focusMatch = options.focus === "all"
      || (options.focus === "attention" && item.lifecycleState === "active" && expiry !== null && expiry <= 60)
      || (options.focus === "resident" && item.lifecycleState === "active" && item.visibility !== "internal")
      || (options.focus === "internal" && item.lifecycleState === "active" && item.visibility === "internal")
      || (options.focus === "archived" && item.lifecycleState === "archived");
    return focusMatch
      && (!normalizedSearch || haystack.includes(normalizedSearch))
      && (!options.category || item.category === options.category)
      && (!options.propertyId || item.property?.id === options.propertyId)
      && (!options.visibility || item.visibility === options.visibility)
      && (!options.lifecycle || item.lifecycleState === options.lifecycle);
  });

  filtered.sort((left, right) => {
    if (options.sort === "name") return left.name.localeCompare(right.name, "sv");
    if (options.sort === "oldest") return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    if (options.sort === "expiry") {
      const leftTime = left.validUntil ? new Date(left.validUntil).getTime() : Number.MAX_SAFE_INTEGER;
      const rightTime = right.validUntil ? new Date(right.validUntil).getTime() : Number.MAX_SAFE_INTEGER;
      return leftTime - rightTime;
    }
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / options.pageSize));
  const page = Math.min(options.page, totalPages);
  const categoryCounts = new Map<string, number>();
  const propertyCounts = new Map<string, { id: string; name: string; count: number }>();
  for (const item of all) {
    if (item.lifecycleState === "archived") continue;
    categoryCounts.set(item.category || "other", (categoryCounts.get(item.category || "other") || 0) + 1);
    if (item.property) {
      const current = propertyCounts.get(item.property.id) || { id: item.property.id, name: item.property.name, count: 0 };
      current.count += 1;
      propertyCounts.set(item.property.id, current);
    }
  }
  const attentionDocuments = all
    .filter((item) => {
      const days = daysUntil(item.validUntil);
      return item.lifecycleState === "active" && days !== null && days <= 60;
    })
    .sort((left, right) => (daysUntil(left.validUntil) ?? 9999) - (daysUntil(right.validUntil) ?? 9999));

  return {
    documents: filtered.slice((page - 1) * options.pageSize, page * options.pageSize),
    properties: raw.properties || [],
    leases: raw.leases || [],
    summary: {
      total: all.length,
      active: all.filter((item) => item.lifecycleState === "active").length,
      unpublished: all.filter((item) => item.lifecycleState === "unpublished").length,
      archived: all.filter((item) => item.lifecycleState === "archived").length,
      residentPublished: all.filter((item) => item.lifecycleState === "active" && item.visibility !== "internal").length,
      attention: attentionDocuments.length,
    },
    categoryRows: [...categoryCounts.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 7),
    propertyRows: [...propertyCounts.values()].sort((left, right) => right.count - left.count).slice(0, 5),
    recentDocuments: [...all].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()).slice(0, 4),
    attentionDocuments: attentionDocuments.slice(0, 5),
    pagination: { page, pageSize: options.pageSize, total: filtered.length, totalPages },
    canManageLifecycle: Boolean(raw.canManageLifecycle),
  };
}

export default function DocumentsPage() {
  const router = useRouter();
  const [data, setData] = useState<Payload>(EMPTY_PAYLOAD);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState("");
  const [lifecycleFilter, setLifecycleFilter] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [focus, setFocus] = useState<FocusKey>("all");
  const [page, setPage] = useState(1);
  const [showUpload, setShowUpload] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("other");
  const [visibility, setVisibility] = useState<Visibility>("internal");
  const [propertyId, setPropertyId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [leaseId, setLeaseId] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [editingId, setEditingId] = useState("");
  const [editForm, setEditForm] = useState({ name: "", category: "other", validUntil: "" });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [changingId, setChangingId] = useState("");
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setDebouncedSearch(search.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const buildParams = useCallback((requestedPage: number, pageSize: number) => {
    const params = new URLSearchParams({ page: String(requestedPage), pageSize: String(pageSize), sort, focus });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (categoryFilter) params.set("category", categoryFilter);
    if (propertyFilter) params.set("propertyId", propertyFilter);
    if (visibilityFilter) params.set("visibility", visibilityFilter);
    if (lifecycleFilter) params.set("lifecycle", lifecycleFilter);
    return params;
  }, [categoryFilter, debouncedSearch, focus, lifecycleFilter, propertyFilter, sort, visibilityFilter]);

  const fetchPayload = useCallback(async (requestedPage: number, pageSize: number) => {
    const params = buildParams(requestedPage, pageSize);
    const response = await fetch(`/api/documents/library?${params.toString()}`, { cache: "no-store" });
    if (response.status === 401) {
      router.push("/login");
      throw new Error("Sessionen har gått ut");
    }
    if (response.status === 409) {
      const legacyResponse = await fetch("/api/documents", { cache: "no-store" });
      const raw = await readResponseJson<LegacyPayload>(legacyResponse);
      if (!legacyResponse.ok) throw new Error(raw.error || "Kunde inte hämta dokument");
      return buildLegacyPayload(raw, {
        page: requestedPage,
        pageSize,
        search: debouncedSearch,
        category: categoryFilter,
        propertyId: propertyFilter,
        visibility: visibilityFilter,
        lifecycle: lifecycleFilter,
        sort,
        focus,
      });
    }
    const payload = await readResponseJson<Payload>(response);
    if (!response.ok) throw new Error(payload.error || "Kunde inte hämta dokument");
    return payload;
  }, [buildParams, categoryFilter, debouncedSearch, focus, lifecycleFilter, propertyFilter, router, sort, visibilityFilter]);

  const loadDocuments = useCallback(async (requestedPage: number) => {
    setLoading(true);
    setError("");
    try {
      const payload = await fetchPayload(requestedPage, 25);
      setData(payload);
      if (payload.pagination.page !== requestedPage) setPage(payload.pagination.page);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte hämta dokument");
    } finally {
      setLoading(false);
    }
  }, [fetchPayload]);

  useEffect(() => {
    void loadDocuments(page);
  }, [loadDocuments, page]);

  const selectedProperty = data.properties.find((property) => property.id === propertyId) || null;
  const availableUnits = selectedProperty?.units || [];
  const availableLeases = data.leases.filter((lease) => visibility !== "resident_unit" || lease.unit_id === unitId);

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
    setDebouncedSearch("");
    setCategoryFilter("");
    setPropertyFilter("");
    setVisibilityFilter("");
    setLifecycleFilter("");
    setSort("newest");
    setFocus("all");
    setPage(1);
  }

  async function exportMetadata() {
    setExporting(true);
    setError("");
    try {
      const first = await fetchPayload(1, 100);
      const documents = [...first.documents];
      for (let current = 2; current <= first.pagination.totalPages; current += 1) {
        const next = await fetchPayload(current, 100);
        documents.push(...next.documents);
      }
      const rows = [
        ["Dokument", "Kategori", "Status", "Synlighet", "Fastighet", "Objekt", "Avtal", "Giltigt till", "Uppladdad", "Uppladdad av", "Filstorlek"],
        ...documents.map((item) => [
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
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte exportera dokument");
    } finally {
      setExporting(false);
    }
  }

  async function uploadDocument(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return setError("Välj en fil");
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
      setPage(1);
      await loadDocuments(1);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte ladda upp dokumentet");
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(item: DocumentItem) {
    if (item.source === "legacy") return setError("Äldre dokument måste backfillas innan de kan ändras.");
    if (item.lifecycleState === "archived") return setError("Återställ dokumentet innan det redigeras.");
    setEditingId(item.id);
    setEditForm({ name: item.name, category: item.category || "other", validUntil: item.validUntil || "" });
    setError("");
  }

  async function saveEdit(item: DocumentItem) {
    setChangingId(item.id);
    setError("");
    try {
      const response = await fetch("/api/documents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: item.id, ...editForm }),
      });
      const payload = await readResponseJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(payload.error || "Kunde inte uppdatera dokumentet");
      setEditingId("");
      setMessage("Dokumentet har uppdaterats.");
      await loadDocuments(page);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte uppdatera dokumentet");
    } finally {
      setChangingId("");
    }
  }

  async function changeLifecycle(item: DocumentItem, transition: "archive" | "unpublish" | "restore") {
    if (item.source === "legacy") return setError("Äldre dokument måste backfillas innan livscykeln ändras.");
    const labels = { archive: "arkivera", unpublish: "avpublicera", restore: "återställa" };
    if (!window.confirm(`Vill du ${labels[transition]} dokumentet ”${item.name}”?`)) return;
    setChangingId(item.id);
    setError("");
    try {
      const response = await fetch(`/api/documents/${item.id}/lifecycle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transition }),
      });
      const payload = await readResponseJson<{ error?: string; state?: LifecycleState }>(response);
      if (!response.ok) throw new Error(payload.error || "Kunde inte ändra dokumentstatus");
      setMessage(`Dokumentet är nu ${payload.state ? lifecycleLabels[payload.state].toLowerCase() : "uppdaterat"}.`);
      await loadDocuments(page);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte ändra dokumentstatus");
    } finally {
      setChangingId("");
    }
  }

  const filtersActive = Boolean(search || categoryFilter || propertyFilter || visibilityFilter || lifecycleFilter || focus !== "all" || sort !== "newest");

  return (
    <div className="space-y-5 sm:space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-petroleum-700">Dokument & fastighetspärm / Översikt</p>
          <h1 className="mt-1 font-display text-[30px] font-semibold tracking-[-0.045em] text-ink-950 sm:text-[34px]">Dokument</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-500">Tenant-säkert dokumentarkiv med serverfiltrering, paginering, livscykel och spårbar åtkomst.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-10 items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 text-[11px] font-semibold text-emerald-800">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" /> Live-data
          </span>
          <button type="button" onClick={() => void exportMetadata()} disabled={exporting || data.pagination.total === 0} className="inline-flex h-10 items-center gap-2 rounded-xl border border-sand-200 bg-white px-3.5 text-[11px] font-semibold text-ink-700 transition hover:border-petroleum-200 hover:text-petroleum-800 disabled:cursor-not-allowed disabled:opacity-50">
            <Download className="h-4 w-4" /> {exporting ? "Exporterar…" : "Exportera filtrerad CSV"}
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
        <StatCard label="Aktiva dokument" value={loading ? "—" : data.summary.active} detail={`${data.summary.total} totalt`} active={focus === "all" && lifecycleFilter === "active"} onClick={() => { setFocus("all"); setLifecycleFilter("active"); setPage(1); }} />
        <StatCard label="Publicerade till boende" value={loading ? "—" : data.summary.residentPublished} detail="Aktiva externa målgrupper" active={focus === "resident"} onClick={() => { setFocus("resident"); setLifecycleFilter(""); setPage(1); }} />
        <StatCard label="Behöver uppmärksamhet" value={loading ? "—" : data.summary.attention} detail="Går ut inom 60 dagar" active={focus === "attention"} warning={data.summary.attention > 0} onClick={() => { setFocus("attention"); setLifecycleFilter(""); setPage(1); }} />
        <StatCard label="Avpublicerade" value={loading ? "—" : data.summary.unpublished} detail="Dolda från boende" active={lifecycleFilter === "unpublished"} onClick={() => { setFocus("all"); setLifecycleFilter("unpublished"); setPage(1); }} />
        <StatCard label="Arkiverade" value={loading ? "—" : data.summary.archived} detail="Bevarade i historiken" active={focus === "archived"} onClick={() => { setFocus("archived"); setLifecycleFilter(""); setPage(1); }} />
      </section>

      {showUpload && data.canManageLifecycle ? (
        <Panel title="Lägg till dokument" description="PDF, bild, Word eller Excel. Max 2 MB. Åtkomsten kontrolleras vid varje nedladdning.">
          <form onSubmit={uploadDocument} className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label><FieldLabel>Dokumentnamn</FieldLabel><input required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} className={premiumFieldClass} placeholder="Exempel: Energideklaration 2026" /></label>
                <label><FieldLabel>Kategori</FieldLabel><select value={category} onChange={(event) => setCategory(event.target.value)} className={premiumFieldClass}>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label><FieldLabel>Synlighet</FieldLabel><select value={visibility} onChange={(event) => { setVisibility(event.target.value as Visibility); setPropertyId(""); setUnitId(""); setLeaseId(""); }} className={premiumFieldClass}>{Object.entries(visibilityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label><FieldLabel>Giltigt till</FieldLabel><input type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} className={premiumFieldClass} /></label>
              </div>
              {(visibility === "resident_property" || visibility === "resident_unit") ? (
                <label><FieldLabel>Fastighet</FieldLabel><select required value={propertyId} onChange={(event) => { setPropertyId(event.target.value); setUnitId(""); }} className={premiumFieldClass}><option value="">Välj fastighet</option>{data.properties.map((property) => <option key={property.id} value={property.id}>{property.name} · {property.address}</option>)}</select></label>
              ) : null}
              {visibility === "resident_unit" ? (
                <label><FieldLabel>Objekt</FieldLabel><select required disabled={!propertyId} value={unitId} onChange={(event) => setUnitId(event.target.value)} className={premiumFieldClass}><option value="">Välj objekt</option>{availableUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.designation}</option>)}</select></label>
              ) : null}
              {visibility === "resident_lease" ? (
                <label><FieldLabel>Hyresavtal</FieldLabel><select required value={leaseId} onChange={(event) => setLeaseId(event.target.value)} className={premiumFieldClass}><option value="">Välj avtal</option>{availableLeases.map((lease) => <option key={lease.id} value={lease.id}>{lease.lease_number} · {lease.unit.designation} · {lease.lease_holder.contact_name || lease.lease_holder.name}</option>)}</select></label>
              ) : null}
            </div>
            <div className="space-y-4">
              <div className="rounded-2xl border border-petroleum-100 bg-petroleum-50/60 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-petroleum-700">Åtkomst</p>
                <p className="mt-1 text-sm font-semibold text-petroleum-950">{visibilityLabels[visibility]}</p>
              </div>
              <label className="block rounded-2xl border border-dashed border-sand-300 bg-[#FCFBF8] p-5 text-center transition hover:border-petroleum-300">
                <UploadCloud className="mx-auto h-6 w-6 text-petroleum-700" />
                <span className="mt-2 block text-sm font-semibold text-ink-800">Välj dokument</span>
                <span className="mt-1 block text-xs text-ink-500">PDF, JPG, PNG, DOCX eller XLSX · max 2 MB</span>
                <input required type="file" accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx" onChange={(event) => setFile(event.target.files?.[0] || null)} className="mt-4 block w-full text-xs text-ink-600 file:mr-3 file:rounded-lg file:border-0 file:bg-sand-100 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-ink-700" />
                {file ? <span className="mt-2 block text-xs font-medium text-petroleum-800">{file.name} · {formatBytes(file.size)}</span> : null}
              </label>
              <button disabled={submitting} className={`${premiumPrimaryButtonClass} w-full justify-center`}>{submitting ? "Sparar dokument…" : "Spara dokument"}</button>
            </div>
          </form>
        </Panel>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <Panel title="Digital fastighetspärm" description="Globala dokumentområden och fastighetsfördelning, oberoende av aktuell sida.">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.categoryRows.map((row) => (
              <button key={row.category} type="button" onClick={() => { setCategoryFilter(row.category); setPage(1); }} className={`flex min-h-20 items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition ${categoryFilter === row.category ? "border-petroleum-200 bg-petroleum-50" : "border-sand-200 bg-[#FCFBF8] hover:border-petroleum-200"}`}>
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-white text-petroleum-700 ring-1 ring-sand-200"><FolderOpen className="h-4 w-4" /></span>
                <span><span className="block text-sm font-semibold text-ink-850">{categoryLabels[row.category] || row.category}</span><span className="text-[11px] text-ink-500">{row.count} dokument</span></span>
              </button>
            ))}
          </div>
        </Panel>
        <Panel title="Fastigheter" description="Flest aktiva dokument i fastighetspärmen.">
          <div className="space-y-2">
            {data.propertyRows.length ? data.propertyRows.map((row) => (
              <button key={row.id} type="button" onClick={() => { setPropertyFilter(row.id); setPage(1); }} className="flex w-full items-center justify-between rounded-xl border border-sand-200 bg-[#FCFBF8] px-3.5 py-3 text-left hover:border-petroleum-200">
                <span className="truncate text-sm font-semibold text-ink-800">{row.name}</span><span className="text-xs text-ink-500">{row.count}</span>
              </button>
            )) : <p className="text-sm text-ink-500">Ingen fastighetskopplad dokumentation ännu.</p>}
          </div>
        </Panel>
      </section>

      <Panel title="Dokumentbibliotek" description="Serverfiltrerat och paginerat för stabil prestanda även när arkivet växer." bodyClassName="p-0">
        <div className="grid gap-3 border-b border-sand-200 p-5 lg:grid-cols-2 xl:grid-cols-[1.3fr_150px_170px_160px_170px_150px]">
          <label className="relative"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-ink-300" /><input maxLength={200} value={search} onChange={(event) => setSearch(event.target.value)} className={`${premiumFieldClass} pl-9`} placeholder="Sök dokument, fastighet eller uppladdare" /></label>
          <select value={categoryFilter} onChange={(event) => { setCategoryFilter(event.target.value); setPage(1); }} className={premiumFieldClass}><option value="">Alla kategorier</option>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <select value={visibilityFilter} onChange={(event) => { setVisibilityFilter(event.target.value); setPage(1); }} className={premiumFieldClass}><option value="">Alla synligheter</option>{Object.entries(visibilityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <select value={lifecycleFilter} onChange={(event) => { setLifecycleFilter(event.target.value); setFocus("all"); setPage(1); }} className={premiumFieldClass}><option value="">Alla statusar</option>{Object.entries(lifecycleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <select value={propertyFilter} onChange={(event) => { setPropertyFilter(event.target.value); setPage(1); }} className={premiumFieldClass}><option value="">Alla fastigheter</option>{data.properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select>
          <select value={sort} onChange={(event) => { setSort(event.target.value as SortKey); setPage(1); }} className={premiumFieldClass}><option value="newest">Nyast först</option><option value="oldest">Äldst först</option><option value="name">Namn A–Ö</option><option value="expiry">Giltighetstid</option></select>
          {filtersActive ? <button type="button" onClick={resetFilters} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-sand-200 bg-white px-3 text-xs font-semibold text-ink-700"><RotateCcw className="h-4 w-4" /> Nollställ</button> : null}
        </div>

        {loading ? (
          <div className="space-y-3 p-6">{[1, 2, 3].map((item) => <div key={item} className="h-28 animate-pulse rounded-xl bg-sand-100" />)}</div>
        ) : data.documents.length === 0 ? (
          <EmptyState title="Inga dokument matchar" description="Justera filtreringen eller lägg till ett nytt dokument." />
        ) : (
          <div className="divide-y divide-sand-100">
            {data.documents.map((item) => (
              <article key={item.id} className="space-y-3 p-5 transition hover:bg-sand-50/70 sm:p-6">
                {editingId === item.id ? (
                  <div className="grid gap-3 md:grid-cols-[1fr_180px_180px_auto]">
                    <input maxLength={200} value={editForm.name} onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))} className={premiumFieldClass} />
                    <select value={editForm.category} onChange={(event) => setEditForm((current) => ({ ...current, category: event.target.value }))} className={premiumFieldClass}>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                    <input type="date" value={editForm.validUntil} onChange={(event) => setEditForm((current) => ({ ...current, validUntil: event.target.value }))} className={premiumFieldClass} />
                    <div className="flex gap-2"><button type="button" disabled={changingId === item.id} onClick={() => void saveEdit(item)} className={premiumPrimaryButtonClass}>Spara</button><button type="button" onClick={() => setEditingId("")} className="rounded-xl border border-sand-200 px-3 text-xs font-semibold">Avbryt</button></div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-ink-950">{item.name}</h3>
                        <Badge>{categoryLabels[item.category] || item.category}</Badge>
                        <Badge>{lifecycleLabels[item.lifecycleState]}</Badge>
                        <Badge>{visibilityLabels[item.visibility as Visibility] || item.visibility}</Badge>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-ink-500">
                        {item.property?.name || "Organisationsgemensamt"}{item.unit ? ` · ${item.unit.designation}` : ""}{item.lease ? ` · ${item.lease.leaseNumber}` : ""}
                      </p>
                      <p className="mt-1 text-xs text-ink-400">{item.fileName || "Fil"} · {formatBytes(item.sizeBytes)} · {item.uploadedBy} · {dateFormatter.format(new Date(item.createdAt))}</p>
                      {item.validUntil ? <p className={`mt-1 text-xs font-medium ${(daysUntil(item.validUntil) ?? 9999) <= 60 ? "text-amber-700" : "text-ink-500"}`}>Giltigt till {item.validUntil}</p> : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <a href={item.downloadUrl} className="inline-flex h-9 items-center gap-2 rounded-xl border border-sand-200 bg-white px-3 text-xs font-semibold text-ink-700 hover:border-petroleum-200"><Download className="h-3.5 w-3.5" /> Ladda ner</a>
                      {data.canManageLifecycle && item.source !== "legacy" ? <button type="button" onClick={() => startEdit(item)} disabled={item.lifecycleState === "archived"} className="inline-flex h-9 items-center gap-2 rounded-xl border border-sand-200 bg-white px-3 text-xs font-semibold text-ink-700 disabled:opacity-40"><Pencil className="h-3.5 w-3.5" /> Redigera</button> : null}
                      {data.canManageLifecycle && item.lifecycleState === "active" ? <button type="button" disabled={changingId === item.id} onClick={() => void changeLifecycle(item, "unpublish")} className="inline-flex h-9 items-center gap-2 rounded-xl border border-sand-200 bg-white px-3 text-xs font-semibold text-ink-700"><EyeOff className="h-3.5 w-3.5" /> Avpublicera</button> : null}
                      {data.canManageLifecycle && item.lifecycleState !== "archived" ? <button type="button" disabled={changingId === item.id} onClick={() => void changeLifecycle(item, "archive")} className="inline-flex h-9 items-center gap-2 rounded-xl border border-sand-200 bg-white px-3 text-xs font-semibold text-ink-700"><Archive className="h-3.5 w-3.5" /> Arkivera</button> : null}
                      {data.canManageLifecycle && item.lifecycleState !== "active" ? <button type="button" disabled={changingId === item.id} onClick={() => void changeLifecycle(item, "restore")} className="inline-flex h-9 items-center gap-2 rounded-xl border border-sand-200 bg-white px-3 text-xs font-semibold text-ink-700"><RotateCcw className="h-3.5 w-3.5" /> Återställ</button> : null}
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}

        <nav className="flex flex-col gap-3 border-t border-sand-200 px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between" aria-label="Dokumentpaginering">
          <p className="text-ink-500">Sida {data.pagination.page} av {data.pagination.totalPages} · {data.pagination.total} matchande dokument</p>
          <div className="flex gap-2">
            <button type="button" disabled={loading || page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="h-10 rounded-xl border border-sand-200 bg-white px-4 text-xs font-semibold text-ink-700 disabled:opacity-40">Föregående</button>
            <button type="button" disabled={loading || page >= data.pagination.totalPages} onClick={() => setPage((current) => Math.min(data.pagination.totalPages, current + 1))} className="h-10 rounded-xl border border-sand-200 bg-white px-4 text-xs font-semibold text-ink-700 disabled:opacity-40">Nästa</button>
          </div>
        </nav>
      </Panel>

      <section className="grid gap-4 xl:grid-cols-2">
        <Panel title="Senaste dokument" description="Senast tillagda i hela organisationen.">
          <MiniList documents={data.recentDocuments} />
        </Panel>
        <Panel title="Behöver uppmärksamhet" description="Aktiva dokument som går ut inom 60 dagar, inklusive redan passerade datum.">
          {data.attentionDocuments.length ? <MiniList documents={data.attentionDocuments} warning /> : <div className="flex items-center gap-2 text-sm text-ink-500"><AlertTriangle className="h-4 w-4 text-emerald-600" /> Inga dokument kräver datumåtgärd.</div>}
        </Panel>
      </section>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="mb-1.5 block text-[11px] font-semibold text-ink-650">{children}</span>;
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-sand-100 px-2.5 py-1 text-[10px] font-semibold text-ink-650 ring-1 ring-sand-200">{children}</span>;
}

function StatCard({ label, value, detail, active, warning, onClick }: { label: string; value: string | number; detail: string; active?: boolean; warning?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-2xl border p-4 text-left shadow-premium-sm transition ${active ? "border-petroleum-200 bg-petroleum-50" : "border-sand-200 bg-white hover:border-petroleum-200"}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${warning ? "text-amber-700" : "text-ink-950"}`}>{value}</p>
      <p className="mt-1 text-[11px] text-ink-500">{detail}</p>
    </button>
  );
}

function QuickLink({ href, icon: Icon, label, detail }: { href: string; icon: typeof FileText; label: string; detail: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-xl border border-sand-200 bg-white px-3.5 py-3 shadow-premium-sm transition hover:border-petroleum-200">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-petroleum-50 text-petroleum-700"><Icon className="h-4 w-4" /></span>
      <span><span className="block text-sm font-semibold text-ink-850">{label}</span><span className="block text-[10px] text-ink-500">{detail}</span></span>
    </Link>
  );
}

function MiniList({ documents, warning = false }: { documents: DocumentItem[]; warning?: boolean }) {
  if (!documents.length) return <p className="text-sm text-ink-500">Inga dokument att visa.</p>;
  return (
    <div className="space-y-2">
      {documents.map((item) => (
        <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-sand-200 bg-[#FCFBF8] px-3.5 py-3">
          <div className="min-w-0"><p className="truncate text-sm font-semibold text-ink-800">{item.name}</p><p className="mt-0.5 text-[10px] text-ink-500">{item.property?.name || "Organisationsgemensamt"}{item.validUntil ? ` · ${item.validUntil}` : ""}</p></div>
          {warning ? <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" /> : <FileText className="h-4 w-4 shrink-0 text-petroleum-700" />}
        </div>
      ))}
    </div>
  );
}
