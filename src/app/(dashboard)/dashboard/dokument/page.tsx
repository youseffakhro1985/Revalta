"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileText, FolderArchive, Search } from "lucide-react";

type Property = { id: string; name: string; address: string; city: string };
type DocumentItem = {
  id: string;
  name: string;
  category: string;
  validUntil: string | null;
  fileName: string | null;
  contentType: string | null;
  sizeBytes: number;
  dataUrl: string | null;
  property: Property | null;
  uploadedBy: string;
  createdAt: string;
};

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
  other: "Övrigt",
};

const inputClass = "block w-full rounded-lg border border-sand-200 bg-white px-3 py-2.5 text-sm text-ink-900 outline-none transition focus:border-petroleum-500 focus:ring-2 focus:ring-petroleum-100";

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("other");
  const [propertyId, setPropertyId] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadDocuments() {
    setLoading(true);
    try {
      const response = await fetch("/api/documents", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunde inte hämta dokument");
      setDocuments(data.documents || []);
      setProperties(data.properties || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte hämta dokument");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadDocuments(); }, []);

  const filtered = useMemo(() => documents.filter((document) => {
    const text = `${document.name} ${document.fileName || ""} ${document.property?.name || ""}`.toLowerCase();
    return (!search || text.includes(search.toLowerCase())) && (!categoryFilter || document.category === categoryFilter) && (!propertyFilter || document.property?.id === propertyFilter);
  }), [documents, search, categoryFilter, propertyFilter]);

  const expiring = documents.filter((document) => document.validUntil && new Date(document.validUntil).getTime() < Date.now() + 1000 * 60 * 60 * 24 * 90).length;

  async function uploadDocument(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return setError("Välj en fil");
    setSubmitting(true); setError(""); setMessage("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", name);
      formData.append("category", category);
      formData.append("propertyId", propertyId);
      formData.append("validUntil", validUntil);
      const response = await fetch("/api/documents", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunde inte ladda upp dokumentet");
      setName(""); setCategory("other"); setPropertyId(""); setValidUntil(""); setFile(null);
      setMessage("Dokumentet har sparats i fastighetspärmen.");
      await loadDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte ladda upp dokumentet");
    } finally { setSubmitting(false); }
  }

  return (
    <div className="space-y-6 animate-fade-in-soft">
      <header className="rounded-2xl border border-sand-200 bg-white p-7 shadow-premium-sm sm:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-petroleum-600">Digital fastighetspärm</p>
        <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div><h1 className="text-[32px] font-semibold tracking-[-0.035em] text-ink-950 sm:text-[36px]">Dokumentarkiv</h1><p className="mt-3 max-w-2xl text-ink-600">Samla avtal, ritningar, protokoll, besiktningar och myndighetsdokument på rätt fastighet.</p></div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-sand-50 px-4 py-3"><p className="text-2xl font-semibold text-ink-950">{documents.length}</p><p className="text-[10px] uppercase tracking-wide text-ink-500">Dokument</p></div>
            <div className="rounded-xl bg-petroleum-50 px-4 py-3"><p className="text-2xl font-semibold text-petroleum-700">{new Set(documents.map((item) => item.property?.id).filter(Boolean)).size}</p><p className="text-[10px] uppercase tracking-wide text-petroleum-700">Fastigheter</p></div>
            <div className="rounded-xl bg-warning-50 px-4 py-3"><p className="text-2xl font-semibold text-warning-700">{expiring}</p><p className="text-[10px] uppercase tracking-wide text-warning-700">Bevakas</p></div>
          </div>
        </div>
      </header>

      {(error || message) && <div className={`rounded-xl border p-4 text-sm font-medium ${error ? "border-danger-200 bg-danger-50 text-danger-700" : "border-success-200 bg-success-50 text-success-700"}`}>{error || message}</div>}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_1fr]">
        <form onSubmit={uploadDocument} className="rounded-2xl border border-sand-200 bg-white p-6 shadow-premium-sm">
          <div className="flex items-center gap-3"><div className="rounded-xl bg-petroleum-50 p-3 text-petroleum-700"><FolderArchive className="h-5 w-5" /></div><div><h2 className="font-semibold text-ink-950">Lägg till dokument</h2><p className="text-sm text-ink-500">PDF, bild, Word eller Excel. Max 2 MB.</p></div></div>
          <div className="mt-6 space-y-4">
            <label className="block text-sm font-medium text-ink-700">Dokumentnamn<input required value={name} onChange={(e) => setName(e.target.value)} className={`${inputClass} mt-1`} placeholder="Ex. OVK-protokoll 2026" /></label>
            <label className="block text-sm font-medium text-ink-700">Kategori<select value={category} onChange={(e) => setCategory(e.target.value)} className={`${inputClass} mt-1`}>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="block text-sm font-medium text-ink-700">Fastighet<select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className={`${inputClass} mt-1`}><option value="">Gemensamt dokument</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>
            <label className="block text-sm font-medium text-ink-700">Giltigt till<input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className={`${inputClass} mt-1`} /></label>
            <label className="block text-sm font-medium text-ink-700">Fil<input required type="file" accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx" onChange={(e) => setFile(e.target.files?.[0] || null)} className={`${inputClass} mt-1`} /></label>
            <button disabled={submitting} className="w-full rounded-lg bg-petroleum-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-petroleum-800 disabled:opacity-60">{submitting ? "Sparar..." : "Spara i fastighetspärmen"}</button>
          </div>
        </form>

        <section className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-premium-sm">
          <div className="border-b border-sand-200 p-5 sm:p-6">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_180px_220px]">
              <label className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-ink-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} className={`${inputClass} pl-9`} placeholder="Sök dokument eller fastighet" /></label>
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={inputClass}><option value="">Alla kategorier</option>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
              <select value={propertyFilter} onChange={(e) => setPropertyFilter(e.target.value)} className={inputClass}><option value="">Alla fastigheter</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select>
            </div>
          </div>
          {loading ? <div className="p-8"><div className="h-40 animate-pulse rounded-xl bg-sand-100" /></div> : filtered.length ? <div className="divide-y divide-sand-100">{filtered.map((document) => <article key={document.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex min-w-0 items-start gap-4"><div className="rounded-xl bg-sand-50 p-3 text-petroleum-700"><FileText className="h-5 w-5" /></div><div className="min-w-0"><h3 className="truncate font-semibold text-ink-950">{document.name}</h3><p className="mt-1 text-sm text-ink-500">{categoryLabels[document.category] || document.category} · {document.property?.name || "Gemensamt"}</p><p className="mt-1 text-xs text-ink-400">{document.fileName || "Fil"} · {(document.sizeBytes / 1024).toFixed(0)} KB · {document.uploadedBy}</p>{document.validUntil && <p className="mt-2 text-xs font-semibold text-warning-700">Giltigt till {new Intl.DateTimeFormat("sv-SE").format(new Date(document.validUntil))}</p>}</div></div>
            {document.dataUrl && <a href={document.dataUrl} download={document.fileName || document.name} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-sand-200 px-3 py-2 text-sm font-semibold text-ink-700 transition hover:bg-sand-50"><Download className="h-4 w-4" /> Hämta</a>}
          </article>)}</div> : <div className="p-12 text-center"><p className="font-semibold text-ink-800">Inga dokument matchar</p><p className="mt-2 text-sm text-ink-500">Ladda upp första dokumentet eller ändra filtreringen.</p></div>}
        </section>
      </div>
    </div>
  );
}
