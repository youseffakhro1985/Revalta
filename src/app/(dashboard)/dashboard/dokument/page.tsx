"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, FileText, FolderArchive, Search, ShieldCheck, UsersRound } from "lucide-react";
import {
  EmptyState,
  InlineAlert,
  MetricCard,
  PageHeader,
  Panel,
  premiumFieldClass,
  premiumPrimaryButtonClass,
} from "@/components/dashboard/premium-ui";

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
type DocumentItem = {
  id: string;
  name: string;
  category: string;
  visibility: string;
  validUntil: string | null;
  fileName: string | null;
  contentType: string | null;
  sizeBytes: number;
  dataUrl: string | null;
  property: Property | null;
  unit: Unit | null;
  lease: { id: string; leaseNumber: string; status: string; holder: string; unit: string } | null;
  uploadedBy: string;
  createdAt: string;
};

type Payload = { documents: DocumentItem[]; properties: Property[]; leases: Lease[] };

type Visibility = "internal" | "resident_all" | "resident_property" | "resident_unit" | "resident_lease";

const categoryLabels: Record<string, string> = {
  contract: "Avtal",
  drawing: "Ritning",
  inspection: "Besiktning",
  ovk: "OVK",
  sba: "SBA",
  energy: "Energideklaration",
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
  resident_property: "Boende i vald fastighet",
  resident_unit: "Boende i valt objekt",
  resident_lease: "Specifikt hyresavtal",
};

const visibilityDescriptions: Record<Visibility, string> = {
  internal: "Dokumentet visas endast i Revaltas interna dokumentarkiv.",
  resident_all: "Alla aktiva boendeavtal i organisationen får tillgång.",
  resident_property: "Alla aktiva avtal i den valda fastigheten får tillgång.",
  resident_unit: "Endast aktiva avtal för det valda objektet får tillgång.",
  resident_lease: "Endast det valda aktiva hyresavtalet får tillgång.",
};

const dateFormatter = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" });

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "Okänd storlek";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} kB`;
  return `${(value / (1024 * 1024)).toLocaleString("sv-SE", { maximumFractionDigits: 1 })} MB`;
}

export default function DocumentsPage() {
  const [data, setData] = useState<Payload>({ documents: [], properties: [], leases: [] });
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState("");
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
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/documents", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Kunde inte hämta dokument");
      setData({ documents: payload.documents || [], properties: payload.properties || [], leases: payload.leases || [] });
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte hämta dokument");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadDocuments(); }, [loadDocuments]);

  const selectedProperty = data.properties.find((property) => property.id === propertyId) || null;
  const availableUnits = selectedProperty?.units || [];
  const availableLeases = data.leases.filter((lease) => {
    if (visibility === "resident_property") return lease.property_id === propertyId;
    if (visibility === "resident_unit") return lease.unit_id === unitId;
    return true;
  });

  const filtered = useMemo(() => data.documents.filter((document) => {
    const text = `${document.name} ${document.fileName || ""} ${document.property?.name || ""} ${document.unit?.designation || ""} ${document.lease?.leaseNumber || ""}`.toLowerCase();
    return (!search || text.includes(search.toLowerCase()))
      && (!categoryFilter || document.category === categoryFilter)
      && (!propertyFilter || document.property?.id === propertyFilter)
      && (!visibilityFilter || document.visibility === visibilityFilter);
  }), [data.documents, search, categoryFilter, propertyFilter, visibilityFilter]);

  const residentPublished = data.documents.filter((document) => document.visibility !== "internal").length;
  const expiring = data.documents.filter((document) => {
    if (!document.validUntil) return false;
    const value = new Date(document.validUntil).getTime();
    return Number.isFinite(value) && value >= Date.now() && value <= Date.now() + 90 * 86_400_000;
  }).length;

  function changeVisibility(next: Visibility) {
    setVisibility(next);
    setPropertyId("");
    setUnitId("");
    setLeaseId("");
  }

  function changeProperty(next: string) {
    setPropertyId(next);
    setUnitId("");
    setLeaseId("");
  }

  function changeUnit(next: string) {
    setUnitId(next);
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
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Kunde inte ladda upp dokumentet");
      resetForm();
      setMessage("Dokumentet har sparats med vald åtkomstnivå.");
      await loadDocuments();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte ladda upp dokumentet");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Digital fastighetspärm"
        title="Dokumentarkiv"
        description="Publicera interna dokument eller ge boende exakt åtkomst per organisation, fastighet, objekt eller hyresavtal."
      />

      {error ? <InlineAlert>{error}</InlineAlert> : null}
      {message ? <InlineAlert tone="success">{message}</InlineAlert> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={FileText} label="Dokument" value={data.documents.length} hint="Totalt i arkivet" />
        <MetricCard icon={UsersRound} label="Publicerade till boende" value={residentPublished} hint="Minst en extern målgrupp" />
        <MetricCard icon={ShieldCheck} label="Endast interna" value={data.documents.length - residentPublished} hint="Syns inte i boendeportalen" />
        <MetricCard icon={FolderArchive} label="Går ut inom 90 dagar" value={expiring} hint="Kräver uppföljning" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <Panel title="Lägg till dokument" description="PDF, bild, Word eller Excel. Max 2 MB. Åtkomsten kontrolleras även när filen laddas ned.">
          <form onSubmit={uploadDocument} className="space-y-4">
            <label className="block space-y-1.5"><span className="text-xs font-semibold text-ink-700">Dokumentnamn</span><input required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} className={premiumFieldClass} placeholder="Exempel: Ordningsregler 2026" /></label>
            <label className="block space-y-1.5"><span className="text-xs font-semibold text-ink-700">Kategori</span><select value={category} onChange={(event) => setCategory(event.target.value)} className={premiumFieldClass}>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="block space-y-1.5"><span className="text-xs font-semibold text-ink-700">Synlighet</span><select value={visibility} onChange={(event) => changeVisibility(event.target.value as Visibility)} className={premiumFieldClass}>{Object.entries(visibilityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>

            <div className="rounded-xl border border-petroleum-100 bg-petroleum-50/70 p-4">
              <p className="text-sm font-semibold text-petroleum-950">{visibilityLabels[visibility]}</p>
              <p className="mt-1 text-xs leading-5 text-petroleum-800">{visibilityDescriptions[visibility]}</p>
            </div>

            {visibility === "resident_property" || visibility === "resident_unit" ? (
              <label className="block space-y-1.5"><span className="text-xs font-semibold text-ink-700">Fastighet</span><select required value={propertyId} onChange={(event) => changeProperty(event.target.value)} className={premiumFieldClass}><option value="">Välj fastighet</option>{data.properties.map((property) => <option key={property.id} value={property.id}>{property.name} · {property.address}</option>)}</select></label>
            ) : null}

            {visibility === "resident_unit" ? (
              <label className="block space-y-1.5"><span className="text-xs font-semibold text-ink-700">Objekt</span><select required disabled={!propertyId} value={unitId} onChange={(event) => changeUnit(event.target.value)} className={premiumFieldClass}><option value="">Välj objekt</option>{availableUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.designation}</option>)}</select></label>
            ) : null}

            {visibility === "resident_lease" ? (
              <label className="block space-y-1.5"><span className="text-xs font-semibold text-ink-700">Hyresavtal</span><select required value={leaseId} onChange={(event) => setLeaseId(event.target.value)} className={premiumFieldClass}><option value="">Välj aktivt avtal</option>{availableLeases.map((lease) => <option key={lease.id} value={lease.id}>{lease.lease_number} · {lease.unit.designation} · {lease.lease_holder.contact_name || lease.lease_holder.name}</option>)}</select></label>
            ) : null}

            <label className="block space-y-1.5"><span className="text-xs font-semibold text-ink-700">Giltigt till</span><input type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} className={premiumFieldClass} /></label>
            <label className="block space-y-1.5"><span className="text-xs font-semibold text-ink-700">Fil</span><input required type="file" accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx" onChange={(event) => setFile(event.target.files?.[0] || null)} className={premiumFieldClass} /></label>
            <button disabled={submitting} className={`${premiumPrimaryButtonClass} w-full`}>{submitting ? "Sparar dokument…" : "Spara med vald åtkomst"}</button>
          </form>
        </Panel>

        <Panel title="Dokumentbibliotek" description="Sök, filtrera och kontrollera dokumentens publiceringsnivå." bodyClassName="p-0">
          <div className="grid gap-3 border-b border-sand-200 p-5 lg:grid-cols-[1fr_170px_190px_180px]">
            <label className="relative"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-ink-300" /><input value={search} onChange={(event) => setSearch(event.target.value)} className={`${premiumFieldClass} pl-9`} placeholder="Sök dokument, objekt eller avtal" /></label>
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className={premiumFieldClass}><option value="">Alla kategorier</option>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <select value={visibilityFilter} onChange={(event) => setVisibilityFilter(event.target.value)} className={premiumFieldClass}><option value="">Alla synligheter</option>{Object.entries(visibilityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <select value={propertyFilter} onChange={(event) => setPropertyFilter(event.target.value)} className={premiumFieldClass}><option value="">Alla fastigheter</option>{data.properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select>
          </div>

          {loading ? <div className="space-y-3 p-6">{[1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-xl bg-sand-100" />)}</div> : filtered.length === 0 ? (
            <EmptyState title="Inga dokument matchar" description="Ladda upp ett dokument eller justera sökning och filter." />
          ) : (
            <div className="divide-y divide-sand-100">
              {filtered.map((document) => {
                const scope = document.lease
                  ? `${document.lease.leaseNumber} · ${document.lease.unit} · ${document.lease.holder}`
                  : document.unit
                    ? `${document.property?.name || "Fastighet"} · ${document.unit.designation}`
                    : document.property?.name || visibilityLabels[document.visibility as Visibility] || document.visibility;
                return (
                  <article key={document.id} className="grid gap-4 p-5 transition hover:bg-sand-50/70 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-center">
                    <div className="flex min-w-0 items-start gap-4">
                      <div className="rounded-xl bg-sand-50 p-3 text-petroleum-700"><FileText className="h-5 w-5" /></div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-ink-950">{document.name}</h3><span className="rounded-full bg-sand-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-ink-600">{categoryLabels[document.category] || document.category}</span><span className="rounded-full bg-petroleum-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-petroleum-800">{visibilityLabels[document.visibility as Visibility] || document.visibility}</span></div>
                        <p className="mt-2 text-sm text-ink-600">{scope}</p>
                        <p className="mt-1 text-xs text-ink-400">{document.fileName || "Fil"} · {formatBytes(document.sizeBytes)} · publicerat {dateFormatter.format(new Date(document.createdAt))} av {document.uploadedBy}</p>
                        {document.validUntil ? <p className="mt-2 text-xs font-semibold text-warning-700">Giltigt till {dateFormatter.format(new Date(document.validUntil))}</p> : null}
                      </div>
                    </div>
                    {document.dataUrl ? <a href={document.dataUrl} download={document.fileName || document.name} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-sand-200 px-4 text-sm font-semibold text-ink-700 transition hover:bg-sand-50"><Download className="h-4 w-4" /> Hämta</a> : null}
                  </article>
                );
              })}
            </div>
          )}
        </Panel>
      </section>
    </div>
  );
}
