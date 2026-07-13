"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Building2, DoorOpen, MapPin } from "lucide-react";

type Property = {
  id: string;
  name: string;
  address: string;
  postal_code: string | null;
  city: string;
  property_identifier: string | null;
  property_type: string;
  status: string;
  created_at: string;
  _count: { tickets: number; buildings: number; units: number };
};

const dateFormatter = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" });

export default function PropertiesPage() {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [properties, setProperties] = useState<Property[]>([]);
  const [loadingProperties, setLoadingProperties] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;
    async function loadProperties() {
      try {
        const response = await fetch("/api/properties", { cache: "no-store" });
        if (response.status === 401) { router.push("/login"); return; }
        const data = await response.json();
        if (!isMounted) return;
        if (!response.ok) { setError(data.error || "Kunde inte hämta fastigheter"); return; }
        setProperties(data.properties || []);
      } catch { if (isMounted) setError("Kunde inte kontakta servern"); }
      finally { if (isMounted) setLoadingProperties(false); }
    }
    loadProperties();
    return () => { isMounted = false; };
  }, [router]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(""); setSuccess(""); setSubmitting(true);
    try {
      const response = await fetch("/api/properties", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, address, postalCode, city }) });
      const data = await response.json();
      if (response.status === 401) { router.push("/login"); return; }
      if (!response.ok) { setError(data.error || "Kunde inte skapa fastigheten"); return; }
      setProperties((current) => [data.property, ...current]);
      setName(""); setAddress(""); setPostalCode(""); setCity("");
      setSuccess("Fastigheten är skapad. Öppna fastighetskortet för att registrera byggnader, lägenheter och lokaler.");
    } catch { setError("Kunde inte kontakta servern"); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="mx-auto max-w-6xl animate-fade-in space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-sand-200 bg-white p-7 shadow-premium-sm sm:flex-row sm:items-end sm:justify-between sm:p-8">
        <div><p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-petroleum-600">Fastigheter</p><h1 className="text-[32px] font-semibold leading-tight tracking-[-0.035em] text-ink-950 sm:text-[36px]">Fastighetsregister</h1><p className="mt-3 max-w-2xl text-ink-600">Samla bestånd, byggnader, lägenheter, lokaler och ärenden i en sammanhållen förvaltningsstruktur.</p></div>
        <div className="rounded-2xl bg-petroleum-50 px-6 py-4 text-center"><p className="text-3xl font-semibold text-petroleum-700">{properties.length}</p><p className="text-xs font-semibold uppercase tracking-wide text-petroleum-600">Registrerade</p></div>
      </div>

      {(error || success) && <div className={`rounded-2xl border p-4 text-sm font-medium ${error ? "border-danger-500 bg-danger-50 text-danger-600" : "border-success-500 bg-success-50 text-success-600"}`}>{error || success}</div>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[0.78fr_1.22fr]">
        <section className="rounded-2xl border border-sand-200 bg-white p-7 shadow-premium-sm sm:p-8">
          <h2 className="text-[22px] font-semibold text-ink-950">Lägg till fastighet</h2><p className="mt-2 text-sm text-ink-500">Börja med adressuppgifter. Övrig förvaltningsdata fylls i på fastighetskortet.</p>
          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <label className="block"><span className="mb-1 block text-sm font-medium text-ink-700">Namn</span><input type="text" required minLength={2} className="block w-full rounded-lg border border-sand-200 p-3 outline-none transition focus:border-petroleum-500 focus:ring-2 focus:ring-petroleum-100" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Brf Solgläntan" /></label>
            <label className="block"><span className="mb-1 block text-sm font-medium text-ink-700">Adress</span><input type="text" required minLength={3} className="block w-full rounded-lg border border-sand-200 p-3 outline-none transition focus:border-petroleum-500 focus:ring-2 focus:ring-petroleum-100" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Ex. Storgatan 12" /></label>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[0.8fr_1.2fr]">
              <label><span className="mb-1 block text-sm font-medium text-ink-700">Postnummer</span><input type="text" className="block w-full rounded-lg border border-sand-200 p-3 outline-none transition focus:border-petroleum-500 focus:ring-2 focus:ring-petroleum-100" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="111 22" /></label>
              <label><span className="mb-1 block text-sm font-medium text-ink-700">Ort</span><input type="text" required minLength={2} className="block w-full rounded-lg border border-sand-200 p-3 outline-none transition focus:border-petroleum-500 focus:ring-2 focus:ring-petroleum-100" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Göteborg" /></label>
            </div>
            <button type="submit" disabled={submitting} className="w-full rounded-lg bg-petroleum-700 px-8 py-3 font-semibold text-white shadow-premium-sm transition hover:bg-petroleum-800 disabled:cursor-not-allowed disabled:opacity-70">{submitting ? "Sparar fastighet..." : "Spara fastighet"}</button>
          </form>
        </section>

        <section className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-premium-sm">
          <div className="border-b border-sand-100 bg-sand-50/70 p-6"><h2 className="text-lg font-semibold text-ink-950">Bestånd</h2><p className="mt-1 text-sm text-ink-500">Öppna ett fastighetskort för att arbeta vidare med struktur och förvaltningsuppgifter.</p></div>
          {loadingProperties ? <div className="space-y-4 p-6">{[1,2,3].map((item) => <div key={item} className="h-28 animate-pulse rounded-2xl bg-sand-100" />)}</div> : properties.length > 0 ? <div className="divide-y divide-sand-100">{properties.map((property) => (
            <Link key={property.id} href={`/dashboard/fastigheter/${property.id}`} className="group block p-6 transition hover:bg-sand-50/70">
              <div className="flex items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-semibold text-ink-950">{property.name}</h3><span className="rounded-full border border-sand-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-400">{property.status === "active" ? "Aktiv" : property.status}</span></div><p className="mt-2 flex items-center gap-2 text-sm leading-6 text-ink-600"><MapPin className="h-4 w-4 text-petroleum-600" />{property.address}{property.postal_code ? `, ${property.postal_code}` : ""} {property.city}</p>{property.property_identifier && <p className="mt-2 text-xs font-medium text-ink-400">{property.property_identifier}</p>}</div><ArrowRight className="mt-1 h-5 w-5 shrink-0 text-ink-300 transition group-hover:translate-x-1 group-hover:text-petroleum-700" /></div>
              <div className="mt-5 grid grid-cols-3 gap-3"><div className="rounded-xl bg-sand-50 px-3 py-2"><p className="flex items-center gap-1.5 text-[11px] font-medium text-ink-400"><Building2 className="h-3.5 w-3.5" />Byggnader</p><p className="mt-1 font-semibold text-ink-900">{property._count.buildings}</p></div><div className="rounded-xl bg-sand-50 px-3 py-2"><p className="flex items-center gap-1.5 text-[11px] font-medium text-ink-400"><DoorOpen className="h-3.5 w-3.5" />Objekt</p><p className="mt-1 font-semibold text-ink-900">{property._count.units}</p></div><div className="rounded-xl bg-sand-50 px-3 py-2"><p className="text-[11px] font-medium text-ink-400">Ärenden</p><p className="mt-1 font-semibold text-ink-900">{property._count.tickets}</p></div></div>
              <p className="mt-4 text-xs font-medium text-ink-400">Registrerad {dateFormatter.format(new Date(property.created_at))}</p>
            </Link>
          ))}</div> : <div className="p-12 text-center"><div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-sand-50"><Building2 className="h-8 w-8 text-ink-400" strokeWidth={1.5} /></div><p className="font-semibold text-ink-800">Inga fastigheter ännu</p><p className="mt-2 text-sm text-ink-500">Lägg till den första fastigheten för att börja bygga beståndet.</p></div>}
        </section>
      </div>
    </div>
  );
}