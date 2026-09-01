"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { InlineAlert, Panel, premiumFieldClass, premiumPrimaryButtonClass } from "@/components/dashboard/premium-ui";
import { readResponseJson } from "@/lib/fetch-json";

type Lease = { id: string; lease_number: string; status: string; property: { name: string }; unit: { designation: string } };

export function HandoverReportCenter() {
  const [leases, setLeases] = useState<Lease[]>([]);
  const [leaseId, setLeaseId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch("/api/leases", { cache: "no-store" }).then(async (response) => {
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte hämta avtal");
      const options = (data.leases || []).filter((lease: Lease) => ["reserved", "active", "notice", "ended"].includes(lease.status));
      setLeases(options);
      setLeaseId(options[0]?.id || "");
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "Kunde inte hämta avtal"));
  }, []);

  return <Panel title="Överlämningsrapport" description="Utskriftsklar sammanställning av avtal, nycklar, besiktning, arbetsorder och historik.">
    <div className="space-y-4">
      {error ? <InlineAlert>{error}</InlineAlert> : null}
      <select className={premiumFieldClass} aria-label="Välj avtal" value={leaseId} onChange={(event) => setLeaseId(event.target.value)}><option value="">Välj avtal</option>{leases.map((lease) => <option key={lease.id} value={lease.id}>{lease.lease_number} · {lease.property.name} · {lease.unit.designation}</option>)}</select>
      <div className="flex justify-end">
        {leaseId ? (
          <Link href={`/dashboard/uthyrning/overlamning/rapport/${leaseId}`} className={premiumPrimaryButtonClass}>
            <FileText className="mr-2 h-4 w-4" aria-hidden="true" />
            Öppna rapport
          </Link>
        ) : (
          <button type="button" disabled className={`${premiumPrimaryButtonClass} cursor-not-allowed opacity-50`}>
            <FileText className="mr-2 h-4 w-4" aria-hidden="true" />
            Öppna rapport
          </button>
        )}
      </div>
    </div>
  </Panel>;
}
