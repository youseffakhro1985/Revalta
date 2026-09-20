"use client";

import { Printer } from "lucide-react";
import { useEffect } from "react";

export function PrintHandoverReportButton() {
  useEffect(() => {
    if (window.location.hash !== "#skriv-ut") return;
    document.getElementById("skriv-ut")?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => document.getElementById("skriv-ut")?.focus(), 0);
  }, []);

  return <button id="skriv-ut" type="button" autoFocus onClick={() => window.print()} className="print:hidden scroll-mt-36 inline-flex h-11 items-center justify-center rounded-xl bg-petroleum-700 px-4 text-sm font-semibold text-white transition hover:bg-petroleum-800">
    <Printer className="mr-2 h-4 w-4" />Skriv ut eller spara som PDF
  </button>;
}
