"use client";

import { Printer } from "lucide-react";

export function PrintHandoverReportButton() {
  return <button type="button" onClick={() => window.print()} className="print:hidden inline-flex h-11 items-center justify-center rounded-xl bg-petroleum-700 px-4 text-sm font-semibold text-white transition hover:bg-petroleum-800">
    <Printer className="mr-2 h-4 w-4" />Skriv ut eller spara som PDF
  </button>;
}
