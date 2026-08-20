"use client";

import { Download, FileDown, RotateCcw } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

export type ReportExportRow = {
  fastighet: string;
  stad: string;
  objekt: number;
  uthyrningsgrad: string;
  oppna_arenden: number;
  aktiva_arbetsorder: number;
  hyresintakter: string;
  kostnadsutfall: string;
};

type PropertyOption = { id: string; name: string };

type ReportsToolbarProps = {
  period: "30" | "90" | "365";
  propertyId: string;
  properties: PropertyOption[];
  rows: ReportExportRow[];
  generatedAt: string;
};

const headers: Array<[keyof ReportExportRow, string]> = [
  ["fastighet", "Fastighet"],
  ["stad", "Ort"],
  ["objekt", "Objekt"],
  ["uthyrningsgrad", "Uthyrningsgrad"],
  ["oppna_arenden", "Öppna ärenden"],
  ["aktiva_arbetsorder", "Aktiva arbetsorder"],
  ["hyresintakter", "Hyresintäkter vald period"],
  ["kostnadsutfall", "Registrerat kostnadsutfall"],
];

function csvCell(value: string | number) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export function ReportsToolbar({ period, propertyId, properties, rows, generatedAt }: ReportsToolbarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateFilter(name: "period" | "property", value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(name, value);
    else params.delete(name);
    router.push(`/dashboard/rapporter?${params.toString()}`);
  }

  function resetFilters() {
    router.push("/dashboard/rapporter?period=90");
  }

  function exportCsv() {
    const lines = [
      "sep=;",
      headers.map(([, label]) => csvCell(label)).join(";"),
      ...rows.map((row) => headers.map(([key]) => csvCell(row[key])).join(";")),
    ];
    const blob = new Blob([`\uFEFF${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `revalta-rapport-${generatedAt.slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="print:hidden flex flex-col gap-3 rounded-2xl border border-sand-200 bg-white p-3 shadow-premium-sm xl:flex-row xl:items-center xl:justify-between">
      <div className="grid gap-2 sm:grid-cols-2 xl:flex xl:items-center">
        <label className="flex items-center gap-2 rounded-xl border border-sand-200 bg-[#FCFBF8] px-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-400">Period</span>
          <select
            aria-label="Välj rapportperiod"
            value={period}
            onChange={(event) => updateFilter("period", event.target.value)}
            className="h-10 min-w-36 bg-transparent text-xs font-semibold text-ink-700 outline-none"
          >
            <option value="30">Senaste 30 dagarna</option>
            <option value="90">Senaste 90 dagarna</option>
            <option value="365">Senaste 12 månaderna</option>
          </select>
        </label>

        <label className="flex items-center gap-2 rounded-xl border border-sand-200 bg-[#FCFBF8] px-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-400">Fastighet</span>
          <select
            aria-label="Filtrera rapport på fastighet"
            value={propertyId}
            onChange={(event) => updateFilter("property", event.target.value)}
            className="h-10 min-w-44 bg-transparent text-xs font-semibold text-ink-700 outline-none"
          >
            <option value="">Hela beståndet</option>
            {properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
          </select>
        </label>

        {(propertyId || period !== "90") ? (
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold text-ink-500 transition hover:bg-sand-50 hover:text-petroleum-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-200"
          >
            <RotateCcw className="h-3.5 w-3.5" />Rensa filter
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={exportCsv}
          disabled={rows.length === 0}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-sand-200 bg-white px-3.5 text-xs font-semibold text-ink-700 transition hover:border-petroleum-200 hover:text-petroleum-800 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-200"
        >
          <Download className="h-4 w-4" />Exportera CSV
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-petroleum-900 px-3.5 text-xs font-semibold text-white transition hover:bg-petroleum-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-300 focus-visible:ring-offset-2"
        >
          <FileDown className="h-4 w-4" />PDF / skriv ut
        </button>
      </div>
    </div>
  );
}
