"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, Download, FileText, RotateCcw, Search, UsersRound, EyeOff } from "lucide-react";
import {
  EmptyState,
  InlineAlert,
  MetricCard,
  PageHeader,
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
type Payload = { documents: DocumentItem[]; properties: Property[]; leases: Lease[]; canManageLifecycle: boolean };
type Visibility = "internal" | "resident_all" | "resident_property" | "resident_unit" | "resident_lease";

const categoryLabels: Record<string, string> = {
  contract: "Avtal", drawing: "Ritning", inspection: "Besiktning", ovk: "OVK", sba: "SBA",
  energy: "Energideklaration", insurance: "Försäkring", warranty: "Garanti", protocol: "Protokoll",
  notice: "Information", rules: "Ordningsregler", certificate: "Intyg", invoice: "Ekonomi", other: "Övrigt",
};
const visibilityLabels: Record<Visibility, string> = {
  internal: "Endast internt", resident_all: "Alla boende", resident_property: "Boende i vald fastighet",
  resident_unit: "Boende i valt objekt", resident_lease: "Specifikt hyresavtal",
};
const visibilityDescriptions: Record<Visibility, string> = {
  internal: "Dokumentet visas endast i Revaltas interna dokumentarkiv.",
  resident_all: "Alla aktiva boendeavtal i organisationen får tillgång.",
  resident_property: "Alla aktiva avtal i den valda fastigheten får tillgång.",
  resident_unit: "Endast aktiva avtal för det valda objektet får tillgång.",
  resident_lease: "Endast det valda aktiva hyresavtalet får tillgång.",
};
const lifecycleLabels: Record<LifecycleState, string> = { active: "Aktivt", unpublished: "Avpublicerat", archived: "Arkiverat" };
const dateFormatter = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" });

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "Okänd storlek";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} kB`;
  return `${(value / (1024 * 1024)).toLocaleString("sv-SE", { maximumFractionDigits: 1 })} MB`;
}

export default function DocumentsPage() {
  const [data, setData] = useState<Payload>({ documents: [], properties: [], leases: [], canManageLifecycle: false });
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState("");
  const [lifecycleFilter, setLifecycleFilter] = useState("");
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
      const payload = await readResponseJson(response);
      if (!response.ok) throw new Error(payload.error || "Kunde inte hämta dokument");
      setData({
        documents: payload.documents || [], properties: payload.properties || [], leases: payload.leases || [],
        canManageLifecycle: Boolean(payload.canManageLifecycle),
      });
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte hämta dokument");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadDocuments(); }, [loadDocuments]);

  const selectedProperty = data.properties.find((property) => property.id === propertyId) || null;
  const availableUnits = selectedProperty?.units || [];
  const availableLeases = data.leases.filter((lease) => visibility !== "resident_unit" || lease.unit_id === unitId);
  const filtered = useMemo(() => data.documents.filter((document) => {
    const text = `${document.name} ${document.fileName || ""} ${document.property?.name || ""} ${document.unit?.designation || ""} ${document.lease?.leaseNumber || ""}`.toLowerCase();
    return (!search || text.includes(search.toLowerCase()))
      && (!categoryFilter || document.category === categoryFilter)
      && (!propertyFilter || document.property?.id === propertyFilter)
      && (!visibilityFilter || document.visibility === visibilityFilter)
      && (!lifecycleFilter || document.lifecycleState === lifecycleFilter);
  }), [data.documents, search, categoryFilter, propertyFilter, visibilityFilter, lifecycleFilter]);

  const active = data.documents.filter((document) => document.lifecycleState === "active").length;
  const residentPublished = data.documents.filter((document) => document.lifecycleState === "active" && document.visibility !== "internal").length;
  const archived = data.documents.filter((document) => document.lifecycleState === "archived").length;

  function changeVisibility(next: Visibility) { setVisibility(next); setPropertyId(""); setUnitId(""); setLeaseId(""); }
  function resetForm() { setName(""); setCategory("other"); setVisibility("internal"); setPropertyId(""); setUnitId(""); setLeaseId(""); setValidUntil(""); setFile(null); }

  async function uploadDocument(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return setError("Välj en fil");
    setSubmitting(true); setError(""); setMessage("");
    try {
      const formData = new FormData();
      formData.append("file", file); formData.append("name", name); formData.append("category", category);
      formData.append("visibility", visibility); formData.append("propertyId", propertyId); formData.append("unitId", unitId);
      formData.append("leaseId", leaseId); formData.append("validUntil", validUntil);
      const response = await fetch("/api/documents", { method: "POST", body: formData });
      const payload = await readResponseJson(response);
      if (!response.ok) throw new Error(payload.error || "Kunde inte ladda upp dokumentet");
      resetForm(); setMessage("Dokumentet har sparats med vald åtkomstnivå."); await loadDocuments();
    } catch (value) { setError(value instanceof Error ? value.message : "Kunde inte ladda upp dokumentet"); }
    finally { setSubmitting(false); }
  }

  function startEdit(document: DocumentItem) {
    if (document.source === "legacy") {
      setError("Dokumentet finns i äldre lagring. Kör backfill till ManagedDocument innan det kan ändras.");
      return;
    }
    if (document.lifecycleState === "archived") {
      setError("Arkiverade dokument kan inte redigeras. Återställ först.");
      return;
    }
    setEditingId(document.id);
    setEditForm({
      name: document.name,
      category: document.category || "other",
      validUntil: document.validUntil || "",
    });
    setError("");
  }

  async function saveEdit(document: DocumentItem) {
    setChangingId(document.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/documents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: document.id,
          name: editForm.name,
          category: editForm.category,
          validUntil: editForm.validUntil,
        }),
      });
      const payload = await readResponseJson(response);
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

  async function changeLifecycle(document: DocumentItem, transition: "archive" | "unpublish" | "restore") {
    if (document.source === "legacy") {
      setError("Dokumentet finns i äldre lagring. Kör backfill till ManagedDocument innan livscykel ändras.");
      return;
    }
    const labels = { archive: "arkivera", unpublish: "avpublicera", restore: "återställa" };
    if (!window.confirm(`Vill du ${labels[transition]} dokumentet ”${document.name}”?`)) return;
    setChangingId(document.id); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/documents/${document.id}/lifecycle`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transition }),
      });
      const payload = await readResponseJson(response);
      if (!response.ok) throw new Error(payload.error || "Kunde inte ändra dokumentstatus");
      setMessage(`Dokumentet är nu ${lifecycleLabels[payload.state as LifecycleState]?.toLowerCase() || "uppdaterat"}.`);
      await loadDocuments();
    } catch (value) { setError(value instanceof Error ? value.message : "Kunde inte ändra dokumentstatus"); }
    finally { setChangingId(""); }
  }

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Digital fastighetspärm" title="Dokumentarkiv" description="Publicera, avpublicera, arkivera och återställ dokument med full revisionshistorik och exakt boendeåtkomst." />
      {error ? <InlineAlert>{error}</InlineAlert> : null}
      {message ? <InlineAlert tone="success">{message}</InlineAlert> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={FileText} label="Aktiva dokument" value={active} hint="Tillgängliga internt" />
        <MetricCard icon={UsersRound} label="Publicerade till boende" value={residentPublished} hint="Aktiva externa målgrupper" />
        <MetricCard icon={EyeOff} label="Avpublicerade" value={data.documents.filter((item) => item.lifecycleState === "unpublished").length} hint="Dolda från boende" />
        <MetricCard icon={Archive} label="Arkiverade" value={archived} hint="Bevarade i historiken" />
      </section>

      <section className={`grid gap-6 ${data.canManageLifecycle ? "xl:grid-cols-[420px_1fr]" : ""}`}>
        {data.canManageLifecycle ? <Panel title="Lägg till dokument" description="PDF, bild, Word eller Excel. Max 2 MB. Åtkomsten kontrolleras vid varje nedladdning.">
          <form onSubmit={uploadDocument} className="space-y-4">
            <label className="block space-y-1.5"><span className="text-xs font-semibold text-ink-700">Dokumentnamn</span><input required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} className={premiumFieldClass} placeholder="Exempel: Ordningsregler 2026" /></label>
            <label className="block space-y-1.5"><span className="text-xs font-semibold text-ink-700">Kategori</span><select value={category} onChange={(e) => setCategory(e.target.value)} className={premiumFieldClass}>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="block space-y-1.5"><span className="text-xs font-semibold text-ink-700">Synlighet</span><select value={visibility} onChange={(e) => changeVisibility(e.target.value as Visibility)} className={premiumFieldClass}>{Object.entries(visibilityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <div className="rounded-xl border border-petroleum-100 bg-petroleum-50/70 p-4"><p className="text-sm font-semibold text-petroleum-950">{visibilityLabels[visibility]}</p><p className="mt-1 text-xs leading-5 text-petroleum-800">{visibilityDescriptions[visibility]}</p></div>
            {(visibility === "resident_property" || visibility === "resident_unit") ? <label className="block space-y-1.5"><span className="text-xs font-semibold text-ink-700">Fastighet</span><select required value={propertyId} onChange={(e) => { setPropertyId(e.target.value); setUnitId(""); }} className={premiumFieldClass}><option value="">Välj fastighet</option>{data.properties.map((property) => <option key={property.id} value={property.id}>{property.name} · {property.address}</option>)}</select></label> : null}
            {visibility === "resident_unit" ? <label className="block space-y-1.5"><span className="text-xs font-semibold text-ink-700">Objekt</span><select required disabled={!propertyId} value={unitId} onChange={(e) => setUnitId(e.target.value)} className={premiumFieldClass}><option value="">Välj objekt</option>{availableUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.designation}</option>)}</select></label> : null}
            {visibility === "resident_lease" ? <label className="block space-y-1.5"><span className="text-xs font-semibold text-ink-700">Hyresavtal</span><select required value={leaseId} onChange={(e) => setLeaseId(e.target.value)} className={premiumFieldClass}><option value="">Välj avtal</option>{availableLeases.map((lease) => <option key={lease.id} value={lease.id}>{lease.lease_number} · {lease.unit.designation} · {lease.lease_holder.contact_name || lease.lease_holder.name}</option>)}</select></label> : null}
            <label className="block space-y-1.5"><span className="text-xs font-semibold text-ink-700">Giltigt till</span><input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className={premiumFieldClass} /></label>
            <label className="block space-y-1.5"><span className="text-xs font-semibold text-ink-700">Fil</span><input required type="file" accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx" onChange={(e) => setFile(e.target.files?.[0] || null)} className={premiumFieldClass} /></label>
            <button disabled={submitting} className={`${premiumPrimaryButtonClass} w-full`}>{submitting ? "Sparar dokument…" : "Spara med vald åtkomst"}</button>
          </form>
        </Panel> : null}

        <Panel title="Dokumentbibliotek" description="Sök, filtrera och hantera dokumentens hela livscykel." bodyClassName="p-0">
          <div className="grid gap-3 border-b border-sand-200 p-5 xl:grid-cols-[1fr_150px_170px_160px_150px]">
            <label className="relative"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-ink-300" /><input value={search} onChange={(e) => setSearch(e.target.value)} className={`${premiumFieldClass} pl-9`} placeholder="Sök dokument, objekt eller avtal" aria-label="Sök dokument, objekt eller avtal" /></label>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={premiumFieldClass} aria-label="Alla kategorier"><option value="">Alla kategorier</option>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <select value={visibilityFilter} onChange={(e) => setVisibilityFilter(e.target.value)} className={premiumFieldClass} aria-label="Alla synligheter"><option value="">Alla synligheter</option>{Object.entries(visibilityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <select value={lifecycleFilter} onChange={(e) => setLifecycleFilter(e.target.value)} className={premiumFieldClass} aria-label="Alla statusar"><option value="">Alla statusar</option>{Object.entries(lifecycleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <select value={propertyFilter} onChange={(e) => setPropertyFilter(e.target.value)} className={premiumFieldClass} aria-label="Alla fastigheter"><option value="">Alla fastigheter</option>{data.properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select>
          </div>

          {loading ? <div className="space-y-3 p-6">{[1,2,3].map((item) => <div key={item} className="h-28 animate-pulse rounded-xl bg-sand-100" />)}</div> : filtered.length === 0 ? <EmptyState title="Inga dokument matchar" description="Ladda upp ett dokument eller justera filtreringen." /> : (
            <div className="divide-y divide-sand-100">{filtered.map((document) => {
              const scope = document.lease ? `${document.lease.leaseNumber} · ${document.lease.unit} · ${document.lease.holder}` : document.unit ? `${document.property?.name || "Fastighet"} · ${document.unit.designation}` : document.property?.name || visibilityLabels[document.visibility as Visibility] || document.visibility;
              const inactive = document.lifecycleState !== "active";
              return <article key={document.id} className={`space-y-3 p-5 sm:p-6 ${inactive ? "bg-sand-50/60" : "hover:bg-sand-50/70"}`}>
                <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
                <div className="flex min-w-0 items-start gap-4"><div className="rounded-xl bg-sand-50 p-3 text-petroleum-700"><FileText className="h-5 w-5" /></div><div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-ink-950">{document.name}</h3><span className="rounded-full bg-sand-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-ink-600">{categoryLabels[document.category] || document.category}</span><span className="rounded-full bg-petroleum-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-petroleum-800">{visibilityLabels[document.visibility as Visibility] || document.visibility}</span><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${document.lifecycleState === "active" ? "bg-success-50 text-success-700" : document.lifecycleState === "unpublished" ? "bg-warning-50 text-warning-700" : "bg-sand-200 text-ink-700"}`}>{lifecycleLabels[document.lifecycleState]}</span></div>
                  <p className="mt-2 text-sm text-ink-600">{scope}</p><p className="mt-1 text-xs text-ink-400">{document.fileName || "Fil"} · {formatBytes(document.sizeBytes)} · publicerat {dateFormatter.format(new Date(document.createdAt))} av {document.uploadedBy}</p>
                  {document.lifecycleChangedAt ? <p className="mt-1 text-xs text-ink-400">Status ändrad {dateFormatter.format(new Date(document.lifecycleChangedAt))}</p> : null}
                  {document.validUntil ? <p className="mt-2 text-xs font-semibold text-warning-700">Giltigt till {dateFormatter.format(new Date(document.validUntil))}</p> : null}
                  {document.source === "legacy" ? <p className="mt-2 text-xs font-medium text-amber-800">Äldre rad – kör backfill innan dokumentet kan ändras.</p> : null}
                </div></div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {document.source !== "legacy" && document.lifecycleState !== "archived" ? <button type="button" onClick={() => (editingId === document.id ? setEditingId("") : startEdit(document))} className="inline-flex h-9 items-center rounded-lg border border-sand-200 px-3 text-xs font-semibold text-ink-700 hover:bg-white">{editingId === document.id ? "Stäng" : "Ändra"}</button> : null}
                  {document.downloadUrl && document.lifecycleState !== "archived" ? <a href={document.downloadUrl} className="inline-flex h-9 items-center gap-2 rounded-lg border border-sand-200 px-3 text-xs font-semibold text-ink-700 hover:bg-white"><Download className="h-3.5 w-3.5" /> Hämta</a> : null}
                  {document.source !== "legacy" && data.canManageLifecycle && document.lifecycleState === "active" && document.visibility !== "internal" ? <button disabled={changingId === document.id} onClick={() => void changeLifecycle(document, "unpublish")} className="inline-flex h-9 items-center gap-2 rounded-lg border border-warning-200 px-3 text-xs font-semibold text-warning-800 hover:bg-warning-50"><EyeOff className="h-3.5 w-3.5" /> Avpublicera</button> : null}
                  {document.source !== "legacy" && data.canManageLifecycle && document.lifecycleState !== "archived" ? <button disabled={changingId === document.id} onClick={() => void changeLifecycle(document, "archive")} className="inline-flex h-9 items-center gap-2 rounded-lg border border-sand-300 px-3 text-xs font-semibold text-ink-700 hover:bg-sand-100"><Archive className="h-3.5 w-3.5" /> Arkivera</button> : null}
                  {document.source !== "legacy" && data.canManageLifecycle && document.lifecycleState !== "active" ? <button disabled={changingId === document.id} onClick={() => void changeLifecycle(document, "restore")} className="inline-flex h-9 items-center gap-2 rounded-lg bg-petroleum-800 px-3 text-xs font-semibold text-white hover:bg-petroleum-900"><RotateCcw className="h-3.5 w-3.5" /> Återställ</button> : null}
                </div>
                </div>
                {editingId === document.id ? (
                  <div className="grid gap-3 rounded-xl border border-sand-200 bg-sand-50/60 p-4 md:grid-cols-3">
                    <input className={premiumFieldClass} value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="Dokumentnamn" aria-label="Dokumentnamn" />
                    <select className={premiumFieldClass} value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })} aria-label="Kategori">
                      {Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <input className={premiumFieldClass} type="date" value={editForm.validUntil} onChange={(e) => setEditForm({ ...editForm, validUntil: e.target.value })} aria-label="Giltigt till" />
                    <button type="button" disabled={changingId === document.id} onClick={() => void saveEdit(document)} className="rounded-xl bg-petroleum-800 px-3 py-2 text-xs font-semibold text-white hover:bg-petroleum-900 md:col-span-3">
                      {changingId === document.id ? "Sparar…" : "Spara ändringar"}
                    </button>
                  </div>
                ) : null}
              </article>;
            })}</div>
          )}
        </Panel>
      </section>
    </div>
  );
}
