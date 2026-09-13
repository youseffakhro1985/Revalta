import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LeaseHandoverCenter } from "@/components/leasing/lease-handover-center";
import { LeaseInspectionItemsCenter } from "@/components/leasing/lease-inspection-items-center";
import { InspectionWorkOrderCenter } from "@/components/leasing/inspection-work-order-center";
import { InspectionResolutionCenter } from "@/components/leasing/inspection-resolution-center";
import { HandoverReportCenter } from "@/components/leasing/handover-report-center";
import { PageHeader } from "@/components/dashboard/premium-ui";

export default function HandoverPage() {
  return <div className="space-y-6">
    <Link href="/dashboard/uthyrning" className="inline-flex items-center gap-2 text-sm font-semibold text-ink-500 transition hover:text-petroleum-800"><ArrowLeft className="h-4 w-4" />Till uthyrningen</Link>
    <PageHeader eyebrow="Uthyrning" title="Överlämning och besiktning" description="Styr in- och avflyttning, besiktningspunkter, nycklar, arbetsorder och slutrapport i ett sammanhållet flöde." />
    <LeaseHandoverCenter />
    <LeaseInspectionItemsCenter />
    <InspectionWorkOrderCenter />
    <InspectionResolutionCenter />
    <HandoverReportCenter />
  </div>;
}
