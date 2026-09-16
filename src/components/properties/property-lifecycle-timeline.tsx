"use client";

import { readResponseJson } from "@/lib/fetch-json";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, FileBadge2, ShieldCheck, Wrench } from "lucide-react";
import { EmptyState, InlineAlert, Panel, premiumFieldClass } from "@/components/dashboard/premium-ui";

type CardData = {
  assets: Record<string, unknown>[];
  warranties: Record<string, unknown>[];
  inspections: Record<string, unknown>[];
  agreements: Record<string, unknown>[];
};

type TimelineItem = {
  id: string;
  date: Date;
  title: string;
  detail: string;
  kind: "service" | "inspection" | "warranty" | "agreement";
};

const dateFormatter = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" });

function text(item: Record<string, unknown>, key: string) {
  return item[key] == null ? "" : String(item[key]);
}

function toDate(value: unknown) {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const config = {
  service: { label: "Service", icon: Wrench },
  inspection: { label: "Besiktning", icon: CalendarClock },
  warranty: { label: "Garanti", icon: ShieldCheck },
  agreement: { label: "Avtal", icon: FileBadge2 },
};

export function PropertyLifecycleTimeline({ propertyId }: { propertyId: string }) {
  const [data, setData] = useState<CardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [kindFilter, setKindFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/properties/${propertyId}/card`, { cache: "no-store" });
      const payload = await readResponseJson(response);
      if (!response.ok) throw new Error(payload.error || "Kunde inte hämta tidslinjen");
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte hämta tidslinjen");
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (loading) return;
    if (window.location.hash !== "#tidslinjefilter") return;
    document.getElementById("tidslinjefilter")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [loading, data]);
  useEffect(() => {
    if (loading) return;
    if (window.location.hash !== "#tidslinjelista") return;
    document.getElementById("tidslinjelista")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [loading, data]);

  const items = useMemo<TimelineItem[]>(() => {
    if (!data) return [];
    const result: TimelineItem[] = [];

    data.assets.forEach((item) => {
      const date = toDate(item.next_service_at);
      if (date) result.push({ id: `service-${text(item, "id")}`, date, title: text(item, "name") || "Teknisk installation", detail: text(item, "service_provider") || "Nästa planerade service", kind: "service" });
    });
    data.inspections.forEach((item) => {
      const date = toDate(item.next_due_at || item.scheduled_at);
      if (date) result.push({ id: `inspection-${text(item, "id")}`, date, title: text(item, "title") || "Besiktning", detail: text(item, "provider") || text(item, "inspection_type") || "Planerad kontroll", kind: "inspection" });
    });
    data.warranties.forEach((item) => {
      const date = toDate(item.expires_at);
      if (date) result.push({ id: `warranty-${text(item, "id")}`, date, title: text(item, "title") || "Garanti", detail: text(item, "supplier") || "Garantiperiod upphör", kind: "warranty" });
    });
    data.agreements.forEach((item) => {
      const date = toDate(item.ends_at);
      if (date) result.push({ id: `agreement-${text(item, "id")}`, date, title: text(item, "supplier") || "Serviceavtal", detail: text(item, "service_area") || "Avtalsperiod upphör", kind: "agreement" });
    });

    return result.sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 20);
  }, [data]);

  const visible = useMemo(
    () => (kindFilter === "all" ? items : items.filter((item) => item.kind === kindFilter)),
    [items, kindFilter],
  );

  if (!loading && error) return <InlineAlert>{error}</InlineAlert>;

  return (
    <div id="tidslinjefilter" className="scroll-mt-36">
    <Panel title="Kommande händelser" description="Samlad tidslinje för service, besiktningar, garantier och avtal." bodyClassName="p-0">
      <form onSubmit={(event) => event.preventDefault()} className="border-b border-sand-100 p-5 sm:px-6">
        <fieldset disabled={loading} className="contents">
          <label className="block max-w-sm">
            <span className="mb-1.5 block text-sm font-medium text-ink-700">Filtrera händelser</span>
            <select autoFocus value={kindFilter} onChange={(event) => setKindFilter(event.target.value)} className={premiumFieldClass} aria-label="Filtrera livscykelhändelser">
              <option value="all">Alla händelser</option>
              <option value="service">Service</option>
              <option value="inspection">Besiktning</option>
              <option value="warranty">Garanti</option>
              <option value="agreement">Avtal</option>
            </select>
          </label>
        </fieldset>
      </form>
      <div id="tidslinjelista" className="scroll-mt-36">
      {loading ? (
        <p className="p-5 text-sm text-ink-500 sm:px-6">Tidslinjen hämtas.</p>
      ) : visible.length === 0 ? (
        <EmptyState title={items.length === 0 ? "Inga kommande datum registrerade" : "Inga händelser matchar filtret"} description={items.length === 0 ? "När service, besiktningar, garantier eller avtal får datum visas de automatiskt här." : "Ändra filtret för att visa fler händelser i livscykeln."} />
      ) : (
        <div className="divide-y divide-sand-100">
          {visible.map((item) => {
            const Icon = config[item.kind].icon;
            const overdue = item.date.getTime() < Date.now();
            return (
              <article key={item.id} className="flex items-start gap-4 p-5 sm:px-6">
                <div className={`rounded-xl p-2.5 ${overdue ? "bg-warning-50 text-warning-800" : "bg-petroleum-50 text-petroleum-700"}`}><Icon className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-ink-900">{item.title}</p>
                      <p className="mt-1 text-sm text-ink-500">{item.detail}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-semibold ${overdue ? "text-warning-800" : "text-ink-800"}`}>{dateFormatter.format(item.date)}</p>
                      <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-ink-500">{overdue ? "Försenad" : config[item.kind].label}</p>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      </div>
    </Panel>
    </div>
  );
}
