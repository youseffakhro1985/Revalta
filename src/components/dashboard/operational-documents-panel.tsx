"use client";

import { FileText, UploadCloud } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { EmptyState, InlineAlert, Panel, premiumFieldClass, premiumPrimaryButtonClass } from "@/components/dashboard/premium-ui";

type DocumentItem = {
  id: string;
  file_name: string;
  storage_url: string;
  content_type: string;
  size_bytes: number;
  category: string;
  visibility: string;
  version: number;
  created_at: string;
  uploaded_by: { id: string; name: string | null; email: string };
};

type Props = {
  entityType: "work_order" | "project" | "property";
  entityId: string;
  title?: string;
  description?: string;
};

const categoryLabels: Record<string, string> = {
  other: "Övrigt",
  photo: "Foto",
  before_photo: "Förebild",
  after_photo: "Efterbild",
  protocol: "Protokoll",
  drawing: "Ritning",
  invoice: "Faktura",
  quote: "Offert",
  contract: "Avtal",
  warranty: "Garanti",
  inspection: "Besiktning",
  operating_instruction: "Driftinstruktion",
};

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} kB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function OperationalDocumentsPanel({ entityType, entityId, title = "Dokument", description = "Samla ritningar, protokoll, före- och efterbilder, offerter och övriga filer på samma plats." }: Props) {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ entityType, entityId });
      const response = await fetch(`/api/operational-documents?${params.toString()}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunde inte hämta dokument");
      setDocuments(data.documents || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte hämta dokument");
    } finally {
      setLoading(false);
    }
  }, [entityId, entityType]);

  useEffect(() => { void load(); }, [load]);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const form = event.currentTarget;
      const formData = new FormData(form);
      formData.set("entityType", entityType);
      formData.set("entityId", entityId);
      const response = await fetch("/api/operational-documents", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunde inte ladda upp dokumentet");
      setSuccess("Dokumentet har laddats upp.");
      form.reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte ladda upp dokumentet");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel title={title} description={description}>
      <div className="space-y-5">
        {(error || success) ? <InlineAlert tone={error ? "error" : "success"}>{error || success}</InlineAlert> : null}

        <form onSubmit={upload} className="grid gap-3 rounded-2xl border border-sand-200 bg-sand-50/70 p-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_auto]">
          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-sand-300 bg-white px-4 text-sm text-ink-600 transition hover:border-petroleum-400">
            <UploadCloud className="h-4 w-4 text-petroleum-700" />
            <span>Välj dokument, bild eller kalkyl</span>
            <input name="file" type="file" required className="sr-only" accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.docx,.xlsx" />
          </label>
          <select name="category" className={premiumFieldClass} defaultValue="other" aria-label="Dokumentkategori">
            {Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select name="visibility" className={premiumFieldClass} defaultValue="internal" aria-label="Dokumentsynlighet">
            <option value="internal">Endast internt</option>
            <option value="shared">Delat</option>
          </select>
          <button disabled={saving} className={premiumPrimaryButtonClass}>{saving ? "Laddar upp…" : "Ladda upp"}</button>
        </form>

        {loading ? (
          <div className="space-y-3">{[0, 1, 2].map((item) => <div key={item} className="h-20 animate-pulse rounded-2xl bg-sand-100" />)}</div>
        ) : documents.length === 0 ? (
          <EmptyState title="Inga dokument uppladdade" description="Ladda upp det första dokumentet för att samla underlag, beslut och historik." />
        ) : (
          <div className="divide-y divide-sand-100 rounded-2xl border border-sand-200 bg-white">
            {documents.map((document) => (
              <a key={document.id} href={document.storage_url} target="_blank" rel="noreferrer" className="flex items-start gap-4 p-4 transition hover:bg-sand-50 sm:p-5">
                <div className="rounded-xl bg-petroleum-50 p-2.5 text-petroleum-700"><FileText className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-semibold text-ink-900">{document.file_name}</p>
                    <span className="rounded-full bg-sand-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-ink-600">{categoryLabels[document.category] || document.category}</span>
                    <span className="rounded-full bg-petroleum-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-petroleum-800">{document.visibility === "shared" ? "Delat" : "Internt"}</span>
                  </div>
                  <p className="mt-1 text-xs text-ink-500">{formatBytes(document.size_bytes)} · Version {document.version} · {document.uploaded_by.name || document.uploaded_by.email}</p>
                  <p className="mt-1 text-xs text-ink-400">{formatDate(document.created_at)}</p>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}
