"use client";

import { Printer } from "lucide-react";

export function InvoicePrintButton() {
  return <button type="button" onClick={() => window.print()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-petroleum-800 px-5 text-sm font-semibold text-white shadow-premium-sm transition hover:bg-petroleum-900 print:hidden"><Printer className="h-4 w-4" />Skriv ut / spara som PDF</button>;
}
