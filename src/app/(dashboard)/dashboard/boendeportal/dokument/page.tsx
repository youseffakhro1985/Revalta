"use client";

import { readResponseJson } from "@/lib/fetch-json";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, FileCheck2, FileText, RefreshCw, Search, ShieldCheck } from "lucide-react";
import {
  EmptyState,
  InlineAlert,
  MetricCard,
  PageHeader,
  Panel,
  premiumFieldClass,
} from "@/components/dashboard/premium-ui";

type Lease = {
  id: string;
  lease_number: string;
  status: string;
  property: { id: string; name: string; address: string; city: string };
  unit: { id: string; designation: string; unit_type: string };
  lease_holder: { id: string; name: string; contact_name: string | null };
};

type ResidentDocument = {
  id: string;
  name: string;
  category: string;
  visibility: string;
  validUntil: string | null;
  fileName: string | null;
  contentType: string | null;
  sizeBytes: number;
  downloadable: boolean;
  accessibleLeaseIds: string[];
  uploadedBy: string;
  createdAt: string;
};

type Payload = {
  leases: Lease[];
  documents: ResidentDocument[];
  isResident?: boolean;
};

const categoryLabels: Record<string, string> = {
  lease: "Hyresavtal",
  notice: "Information",
  rules: "Ordningsregler",
  inspection: "Besiktning",
  invoice: "Ekonomi",
  certificate: "Intyg",
  other: "Övrigt",
};

const dateFormatter = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" });

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "Okänd storlek";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} kB`;
  return `${(value / (1024 * 1024)).toLocaleString("sv-SE", { maximumFractionDigits: 1 })} MB`;
}

export default function ResidentDocumentsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [selectedLeaseId, setSelectedLeaseId] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/resident-portal", { cache: "no-store" });
      const payload = await readResponseJson(response);
      if (!response.ok) throw new Error(payload.error || "Kunde inte hämta boendedokument");
      setData({
        leases: payload.leases || [],
        documents: payload.documents || [],
        isResident: Boolean(payload.isResident),
      });
      setSelectedLeaseId((current) => {
        if (current && payload.leases?.some((lease: Lease) => lease.id === current)) return current;
        return payload.leases?.[0]?.id || "";
      });
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte hämta boendedokument");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const selectedLease = data?.leases.find((lease) => lease.id === selectedLeaseId) || null;
  const visibleDocuments = useMemo(() => {
    if (!data || !selectedLeaseId) return [];
    const normalized = query.trim().toLowerCase();
    return data.documents.filter((document) => {
      if (!document.accessibleLeaseIds.includes(selectedLeaseId)) return false;
      if (!normalized) return true;
      return `${document.name} ${document.fileName || ""} ${categoryLabels[document.category] || document.category}`
        .toLowerCase()
        .includes(normalized);
    });
  }, [data, selectedLeaseId, query]);

  const expiringCount = visibleDocuments.filter((document) => {
    if (!document.validUntil) return false;
    const deadline = new Date(document.validUntil).getTime();
    return Number.isFinite(deadline) && deadline >= Date.now() && deadline <= Date.now() + 30 * 86_400_000;
  }).length;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={data?.isResident ? "Min boendeservice" : "Boende och kundservice"}
        title={data?.isResident ? "Mina dokument" : "Boendedokument"}
        description={data?.isResident
          ? "Dokument som förvaltningen har publicerat för ditt hyresavtal och objekt."
          : "Visa avtal, information, intyg och andra filer med strikt åtkomst per aktivt hyresavtal och objekt."}
      />

      {error ? <InlineAlert>{error}</InlineAlert> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={FileText} label="Tillgängliga dokument" value={visibleDocuments.length} hint="För valt avtal" />
        <MetricCard icon={FileCheck2} label="Giltiga dokument" value={visibleDocuments.filter((item) => !item.validUntil || new Date(item.validUntil).getTime() >= Date.now()).length} hint="Inte passerat slutdatum" />
        <MetricCard icon={RefreshCw} label="Går ut inom 30 dagar" value={expiringCount} hint="Kräver uppföljning" />
        <MetricCard icon={ShieldCheck} label="Åtkomstmodell" value="Tenant-säker" hint="Kontrolleras vid hämtning" />
      </section>

      <Panel title="Välj boende och avtal" description="Dokumentlistan räknas om efter det valda aktiva avtalet.">
        {loading ? <div className="h-24 animate-pulse rounded-xl bg-sand-100" /> : !data?.leases.length ? (
          <EmptyState title="Inga aktiva avtal" description="Boendedokument blir tillgängliga när ett aktivt eller uppsagt avtal finns i uthyrningsmodulen." />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr] lg:items-end">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-ink-700">Aktivt hyresavtal</span>
              <select value={selectedLeaseId} onChange={(event) => setSelectedLeaseId(event.target.value)} className={premiumFieldClass}>
                {data.leases.map((lease) => (
                  <option key={lease.id} value={lease.id}>
                    {lease.property.name} · {lease.unit.designation} · {lease.lease_holder.contact_name || lease.lease_holder.name}
                  </option>
                ))}
              </select>
            </label>
            {selectedLease ? (
              <div className="rounded-xl border border-sand-200 bg-sand-50/70 px-4 py-3">
                <p className="text-sm font-semibold text-ink-900">{selectedLease.lease_holder.name}</p>
                <p className="mt-1 text-xs leading-5 text-ink-500">
                  {selectedLease.property.name} · {selectedLease.unit.designation} · Avtal {selectedLease.lease_number}
                </p>
              </div>
            ) : null}
          </div>
        )}
      </Panel>

      <Panel title="Dokumentbibliotek" description="Endast dokument som servern har godkänt för det valda avtalet visas." bodyClassName="p-0">
        <div className="flex flex-col gap-3 border-b border-sand-200 p-5 sm:flex-row">
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-ink-300" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Sök dokumentnamn, fil eller kategori" aria-label="Sök dokumentnamn, fil eller kategori" className={`${premiumFieldClass} pl-9`} />
          </label>
          <button type="button" onClick={() => void load()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-sand-200 bg-white px-4 py-2 text-sm font-semibold text-ink-700 shadow-sm hover:bg-sand-50">
            <RefreshCw className="h-4 w-4" /> Uppdatera
          </button>
        </div>

        {loading ? (
          <div className="space-y-3 p-6">{[1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-xl bg-sand-100" />)}</div>
        ) : visibleDocuments.length === 0 ? (
          <EmptyState title="Inga dokument för detta avtal" description="Dokument som publiceras för organisationen, fastigheten, objektet eller det valda avtalet visas här." />
        ) : (
          <div className="divide-y divide-sand-100">
            {visibleDocuments.map((document) => {
              const expired = Boolean(document.validUntil && new Date(document.validUntil).getTime() < Date.now());
              const downloadUrl = `/api/resident-portal/documents/${encodeURIComponent(document.id)}/download?leaseId=${encodeURIComponent(selectedLeaseId)}`;
              return (
                <article key={document.id} className="grid gap-4 p-5 transition hover:bg-sand-50/70 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-ink-900">{document.name}</h3>
                      <span className="rounded-full bg-sand-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-ink-600">
                        {categoryLabels[document.category] || document.category}
                      </span>
                      {expired ? <span className="rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-red-800">Utgånget</span> : null}
                    </div>
                    <p className="mt-2 text-sm text-ink-500">{document.fileName || "Dokumentfil"} · {formatBytes(document.sizeBytes)}</p>
                    <p className="mt-1 text-xs text-ink-500">
                      Publicerat {dateFormatter.format(new Date(document.createdAt))} av {document.uploadedBy}
                      {document.validUntil ? ` · giltigt till ${dateFormatter.format(new Date(document.validUntil))}` : ""}
                    </p>
                  </div>
                  {document.downloadable ? (
                    <a href={downloadUrl} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-petroleum-800 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-petroleum-900">
                      <Download className="h-4 w-4" /> Hämta dokument
                    </a>
                  ) : (
                    <span className="text-xs font-semibold text-red-700">Filen saknas eller har ett ogiltigt format</span>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
