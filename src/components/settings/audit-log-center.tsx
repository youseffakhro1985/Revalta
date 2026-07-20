"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Filter, RefreshCw, ShieldCheck } from "lucide-react";
import {
  InlineAlert,
  Panel,
  premiumFieldClass,
  premiumPrimaryButtonClass,
  premiumSecondaryButtonClass,
} from "@/components/dashboard/premium-ui";

type AuditLog = {
  id: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  metadata: unknown;
  created_at: string;
  actor: { id: string; name: string | null; email: string } | null;
};

type AuditResponse = {
  auditLogs: AuditLog[];
  filters: { entityTypes: string[] };
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  error?: string;
};

const entityLabels: Record<string, string> = {
  company: "Organisation",
  user: "Användare",
  property: "Fastighet",
  building: "Byggnad",
  unit: "Objekt",
  ticket: "Felanmälan",
  work_order: "Arbetsorder",
  project: "Projekt",
  document: "Dokument",
  lease: "Hyresavtal",
  lease_holder: "Hyrespart",
  integration: "Integration",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatAction(value: string) {
  return value
    .replace(/\.v\d+\./g, ".")
    .split(".")
    .filter(Boolean)
    .map((part) => part.replaceAll("_", " "))
    .join(" · ");
}

function metadataSummary(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "Ingen kompletterande information";
  const entries = Object.entries(metadata as Record<string, unknown>).slice(0, 4);
  if (!entries.length) return "Ingen kompletterande information";
  return entries
    .map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`)
    .join(" · ");
}

export function AuditLogCenter() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [entityTypes, setEntityTypes] = useState<string[]>([]);
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const [actor, setActor] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 25, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (entityType) params.set("entityType", entityType);
    if (action.trim()) params.set("action", action.trim());
    if (actor.trim()) params.set("actor", actor.trim());
    return params.toString();
  }, [action, actor, entityType, page]);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/audit?${query}`, { cache: "no-store" });
      const data = (await response.json()) as AuditResponse;
      if (!response.ok) throw new Error(data.error || "Kunde inte hämta systemloggen");
      setLogs(data.auditLogs || []);
      setEntityTypes(data.filters?.entityTypes || []);
      setPagination(data.pagination);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunde inte hämta systemloggen");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  function resetFilters() {
    setEntityType("");
    setAction("");
    setActor("");
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <Panel
        title="Systemlogg"
        description="Spårbar historik över viktiga ändringar i organisationen. Endast ägare och administratörer har åtkomst."
      >
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_auto]">
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Händelsetyp
            <select
              className={premiumFieldClass}
              value={entityType}
              onChange={(event) => {
                setEntityType(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Alla typer</option>
              {entityTypes.map((type) => (
                <option key={type} value={type}>
                  {entityLabels[type] || type}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Åtgärd
            <input
              className={premiumFieldClass}
              value={action}
              onChange={(event) => {
                setAction(event.target.value);
                setPage(1);
              }}
              placeholder="Exempel: created eller updated"
            />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Utförd av
            <input
              className={premiumFieldClass}
              value={actor}
              onChange={(event) => {
                setActor(event.target.value);
                setPage(1);
              }}
              placeholder="Namn eller e-post"
            />
          </label>
          <div className="flex items-end gap-2">
            <button type="button" className={premiumSecondaryButtonClass} onClick={resetFilters}>
              <Filter className="mr-2 h-4 w-4" />
              Rensa
            </button>
            <button type="button" className={premiumPrimaryButtonClass} onClick={() => void loadLogs()} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Uppdatera
            </button>
          </div>
        </div>
      </Panel>

      <Panel
        title="Händelser"
        description={`${pagination.total.toLocaleString("sv-SE")} loggade händelser`}
      >
        <div className="space-y-4">
          {error ? <InlineAlert>{error}</InlineAlert> : null}
          {!loading && !error && logs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center">
              <ShieldCheck className="mx-auto h-8 w-8 text-slate-400" />
              <p className="mt-3 font-medium text-slate-900">Inga händelser matchar urvalet</p>
              <p className="mt-1 text-sm text-slate-500">Justera filtren eller rensa urvalet för att visa fler poster.</p>
            </div>
          ) : null}

          <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {logs.map((log) => (
              <article key={log.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[180px_180px_1fr]">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{entityLabels[log.entity_type] || log.entity_type}</p>
                  <p className="mt-1 text-xs text-slate-500">{formatDate(log.created_at)}</p>
                </div>
                <div>
                  <p className="text-sm font-medium capitalize text-slate-800">{formatAction(log.action)}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {log.actor?.name || log.actor?.email || "Systemhändelse"}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm text-slate-600">{metadataSummary(log.metadata)}</p>
                  {log.entity_id ? <p className="mt-1 truncate font-mono text-xs text-slate-400">ID {log.entity_id}</p> : null}
                </div>
              </article>
            ))}
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">
              Sida {pagination.page} av {pagination.totalPages}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className={premiumSecondaryButtonClass}
                disabled={loading || page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <ChevronLeft className="mr-2 h-4 w-4" />
                Föregående
              </button>
              <button
                type="button"
                className={premiumSecondaryButtonClass}
                disabled={loading || page >= pagination.totalPages}
                onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}
              >
                Nästa
                <ChevronRight className="ml-2 h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}
