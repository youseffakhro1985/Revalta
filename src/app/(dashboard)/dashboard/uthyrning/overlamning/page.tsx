import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LeaseHandoverCenter } from "@/components/leasing/lease-handover-center";

export default function HandoverPage() {
  return <div className="space-y-6">
    <Link href="/dashboard/uthyrning" className="inline-flex items-center gap-2 text-sm font-semibold text-ink-500 transition hover:text-petroleum-800"><ArrowLeft className="h-4 w-4" />Till uthyrningen</Link>
    <LeaseHandoverCenter />
  </div>;
}
