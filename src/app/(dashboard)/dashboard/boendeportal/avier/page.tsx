"use client";

import { useCallback, useEffect, useState } from "react";
import { HandCoins, RefreshCw } from "lucide-react";
import {
  EmptyState,
  InlineAlert,
  MetricCard,
  PageHeader,
  Panel,
} from "@/components/dashboard/premium-ui";
import { readResponseJson } from "@/lib/fetch-json";

type Notice = {
  id: string;
  property: { id: string; name: string; address: string; city: string };
  period: string;
  dueDate: string;
  status: string;
  total: number;
  baseRent: number;
  additions: number;
  deductions: number;
  unit: string | null;
  note: string | null;
};

const statusLabels: Record<string, string> = {
  sent: "Skickad",
  issued: "Utfärdad",
  published: "Publicerad",
  paid: "Betald",
  overdue: "Förfallen",
  cancelled: "Makulerad",
};

const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const dateFormatter = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" });

export default function ResidentNoticesPage() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [leaseCount, setLeaseCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/resident-portal/notices", { cache: "no-store" });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte hämta avier");
      setNotices(data.notices || []);
      setLeaseCount((data.leases || []).length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte hämta avier");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openTotal = notices
    .filter((notice) => !["paid", "cancelled"].includes(notice.status))
    .reduce((sum, notice) => sum + notice.total, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Min boendeservice"
        title="Mina avier"
        description="Hyresavier kopplade till dina aktiva avtal. Kontakta förvaltningen om något saknas."
        action={(
          <button type="button" onClick={() => void load()} className="inline-flex h-11 items-center gap-2 rounded-xl border border-sand-200 bg-white px-4 text-sm font-semibold text-ink-700 hover:bg-sand-50">
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Uppdatera
          </button>
        )}
      />

      {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
      {!loading && leaseCount === 0 ? (
        <InlineAlert tone="info">
          Inget aktivt hyresavtal är kopplat till din e-postadress ännu. Kontakta förvaltningen om du behöver hjälp.
        </InlineAlert>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2">
        <MetricCard icon={HandCoins} label="Avier" value={notices.length} hint="Publicerade hyresavier" />
        <MetricCard label="Öppet belopp" value={money.format(openTotal)} hint="Exklusive betalda och makulerade" />
      </section>

      <Panel title="Hyresavier" description="Belopp och förfallodatum för dina avtal." bodyClassName="p-0">
        {loading ? (
          <div className="space-y-3 p-6">{[1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-xl bg-sand-100" />)}</div>
        ) : notices.length === 0 ? (
          <EmptyState
            title="Inga avier ännu"
            description={leaseCount === 0
              ? "När ditt avtal är kopplat till din e-post visas avierna här."
              : "När förvaltningen publicerar en hyresavi syns den här."}
          />
        ) : (
          <div className="divide-y divide-sand-100">
            {notices.map((notice) => (
              <article key={notice.id} className="grid gap-3 p-6 sm:grid-cols-[1.2fr_1fr_auto] sm:items-center">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-petroleum-700">
                    {notice.period} · {notice.property.name}{notice.unit ? ` · ${notice.unit}` : ""}
                  </p>
                  <h3 className="mt-1 font-semibold text-ink-900">Förfaller {dateFormatter.format(new Date(notice.dueDate))}</h3>
                  {notice.note ? <p className="mt-1 text-sm text-ink-500">{notice.note}</p> : null}
                </div>
                <div className="text-sm text-ink-600">
                  <p>Grundhyra: {money.format(notice.baseRent)}</p>
                  <p className="mt-1">Tillägg/avdrag: {money.format(notice.additions - notice.deductions)}</p>
                </div>
                <div className="flex flex-col items-start gap-2 sm:items-end">
                  <span className="rounded-full bg-petroleum-50 px-3 py-1 text-xs font-semibold text-petroleum-800">
                    {statusLabels[notice.status] || notice.status}
                  </span>
                  <p className="text-lg font-semibold text-ink-900">{money.format(notice.total)}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
