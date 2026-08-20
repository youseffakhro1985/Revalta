"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  MapPinned,
  MapPin,
} from "lucide-react";
import { readResponseJson } from "@/lib/fetch-json";

type MapProperty = {
  id: string;
  name: string;
  address: string;
  postal_code: string | null;
  city: string;
  status: string;
  _count: { units: number };
};

type PropertyResponse = {
  properties?: MapProperty[];
  error?: string;
};

function propertyAddress(property: MapProperty) {
  return [property.address, property.postal_code, property.city, "Sverige"].filter(Boolean).join(", ");
}

function selectedPropertyIdFromPath(pathname: string) {
  const match = pathname.match(/^\/dashboard\/fastigheter\/([^/]+)$/);
  if (!match) return null;
  const candidate = match[1];
  return candidate === "ny" ? null : candidate;
}

export function FastigheterMapDock() {
  const pathname = usePathname();
  const router = useRouter();
  const [properties, setProperties] = useState<MapProperty[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(selectedPropertyIdFromPath(pathname));
  const [open, setOpen] = useState(pathname === "/dashboard/fastigheter");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const response = await fetch("/api/properties", { cache: "no-store" });
        if (response.status === 401) {
          router.push("/login");
          return;
        }
        const body = await readResponseJson<PropertyResponse>(response);
        if (!response.ok) throw new Error(body.error || "Kunde inte hämta fastigheter");
        if (!mounted) return;
        const next = body.properties || [];
        setProperties(next);
        setSelectedId((current) => {
          const pathId = selectedPropertyIdFromPath(pathname);
          if (pathId && next.some((property) => property.id === pathId)) return pathId;
          if (current && next.some((property) => property.id === current)) return current;
          return next[0]?.id || null;
        });
      } catch (loadError) {
        if (mounted) setError(loadError instanceof Error ? loadError.message : "Kunde inte läsa kartdata");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void load();
    return () => { mounted = false; };
  }, [pathname, router]);

  useEffect(() => {
    const pathId = selectedPropertyIdFromPath(pathname);
    if (pathId && properties.some((property) => property.id === pathId)) setSelectedId(pathId);
  }, [pathname, properties]);

  const selected = useMemo(
    () => properties.find((property) => property.id === selectedId) || properties[0] || null,
    [properties, selectedId],
  );

  const address = selected ? propertyAddress(selected) : "";
  const mapEmbedUrl = selected
    ? `https://maps.google.com/maps?q=${encodeURIComponent(address)}&z=15&output=embed`
    : "";
  const mapsUrl = selected
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    : "";

  return (
    <aside className="pointer-events-none fixed bottom-4 left-4 right-4 z-20 lg:left-auto lg:right-6 lg:w-[360px]" aria-label="Fastighetskarta">
      <div className="pointer-events-auto overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-premium-lg">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-sand-50/80"
          aria-expanded={open}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-petroleum-50 text-petroleum-700">
            <MapPinned className="h-[18px] w-[18px]" strokeWidth={1.7} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-semibold text-ink-900">Fastighetskarta</span>
            <span className="mt-0.5 block truncate text-[9px] text-ink-450">
              {loading ? "Läser fastigheter…" : properties.length ? `${properties.length} fastigheter · klicka för plats och objekt` : "Ingen fastighet registrerad"}
            </span>
          </span>
          {open ? <ChevronDown className="h-4 w-4 text-ink-400" /> : <ChevronUp className="h-4 w-4 text-ink-400" />}
        </button>

        {open ? (
          <div className="border-t border-sand-100">
            {error ? (
              <div className="px-4 py-4 text-[11px] text-danger-700">{error}</div>
            ) : !selected ? (
              <div className="px-4 py-5 text-center">
                <Building2 className="mx-auto h-6 w-6 text-sand-400" />
                <p className="mt-2 text-[11px] font-semibold text-ink-750">Kartan visas när första fastigheten är registrerad.</p>
              </div>
            ) : (
              <>
                <div className="relative h-[156px] overflow-hidden bg-sand-100">
                  <iframe
                    key={selected.id}
                    title={`Karta för ${selected.name}`}
                    src={mapEmbedUrl}
                    className="h-full w-full border-0"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    allowFullScreen
                  />
                  <div className="pointer-events-none absolute left-3 top-3 rounded-lg border border-white/70 bg-white/92 px-2.5 py-1.5 shadow-sm backdrop-blur-sm">
                    <p className="max-w-[230px] truncate text-[10px] font-semibold text-ink-850">{selected.name}</p>
                  </div>
                </div>

                <div className="space-y-3 p-3.5">
                  {properties.length > 1 ? (
                    <label className="block">
                      <span className="sr-only">Välj fastighet på kartan</span>
                      <select
                        value={selected.id}
                        onChange={(event) => setSelectedId(event.target.value)}
                        className="h-9 w-full rounded-xl border border-sand-200 bg-[#FCFBF8] px-3 text-[10px] font-semibold text-ink-700 outline-none focus:border-petroleum-300 focus:ring-2 focus:ring-petroleum-100"
                      >
                        {properties.map((property) => (
                          <option key={property.id} value={property.id}>{property.name} · {property.city}</option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sand-50 text-petroleum-700">
                      <MapPin className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-semibold text-ink-850">{selected.name}</p>
                      <p className="mt-0.5 line-clamp-2 text-[9px] leading-4 text-ink-450">{address}</p>
                    </div>
                    <span className="shrink-0 rounded-full border border-sand-200 bg-sand-50 px-2 py-1 text-[9px] font-semibold text-ink-550">
                      {selected._count.units} objekt
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Link
                      href={`/dashboard/fastigheter/${selected.id}`}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-petroleum-900 px-3 text-[10px] font-semibold text-white transition hover:bg-petroleum-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-300"
                    >
                      <Building2 className="h-3.5 w-3.5" /> Öppna objekt
                    </Link>
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-sand-200 bg-white px-3 text-[10px] font-semibold text-petroleum-750 transition hover:bg-petroleum-50"
                    >
                      <MapPin className="h-3.5 w-3.5" /> Visa plats <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
