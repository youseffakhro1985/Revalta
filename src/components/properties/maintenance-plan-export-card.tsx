"use client";

import Link from "next/link";
import { Download, FileText } from "lucide-react";
import { Panel } from "@/components/dashboard/premium-ui";

export function MaintenancePlanExportCard({ propertyId }: { propertyId: string }) {
  return (
    <Panel title="Rapport och export" description="Ta fram ett styrelseunderlag eller öppna budgeten i svensk Excel.">
      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href={`/underhallsrapport/${propertyId}`}
          target="_blank"
          className="flex min-h-20 items-center gap-4 rounded-xl border border-sand-200 bg-white p-4 transition hover:border-petroleum-300 hover:bg-petroleum-50/40 focus:outline-none focus:ring-2 focus:ring-petroleum-100"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-petroleum-50 text-petroleum-700"><FileText className="h-5 w-5" /></span>
          <span><span className="block text-sm font-semibold text-ink-900">Underhållsrapport</span><span className="mt-1 block text-xs leading-5 text-ink-500">Utskriftsvänlig rapport som kan sparas som PDF.</span></span>
        </Link>
        <a
          href={`/api/properties/${propertyId}/maintenance-plan/export`}
          className="flex min-h-20 items-center gap-4 rounded-xl border border-sand-200 bg-white p-4 transition hover:border-petroleum-300 hover:bg-petroleum-50/40 focus:outline-none focus:ring-2 focus:ring-petroleum-100"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-petroleum-50 text-petroleum-700"><Download className="h-5 w-5" /></span>
          <span><span className="block text-sm font-semibold text-ink-900">Budgetexport</span><span className="mt-1 block text-xs leading-5 text-ink-500">CSV med årsplan, indexerade kostnader och åtgärder.</span></span>
        </a>
      </div>
    </Panel>
  );
}
