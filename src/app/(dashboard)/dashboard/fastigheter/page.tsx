"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Property = {
  id: string;
  name: string;
  address: string;
  postal_code: string | null;
  city: string;
  created_at: string;
  _count: {
    tickets: number;
  };
};

const dateFormatter = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "medium",
});

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
        if (response.status === 401) {
          router.push("/login");
          return;
        }

        const data = await response.json();
        if (!isMounted) return;

        if (!response.ok) {
          setError(data.error || "Kunde inte hämta fastigheter");
          return;
        }

        setProperties(data.properties || []);
      } catch {
        if (isMounted) {
          setError("Kunde inte kontakta servern");
        }
      } finally {
        if (isMounted) {
          setLoadingProperties(false);
        }
      }
    }

    loadProperties();

    return () => {
      isMounted = false;
    };
  }, [router]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);

    try {
      const response = await fetch("/api/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, address, postalCode, city }),
      });
      const data = await response.json();

      if (response.status === 401) {
        router.push("/login");
        return;
      }

      if (!response.ok) {
        setError(data.error || "Kunde inte skapa fastigheten");
        return;
      }

      setProperties((current) => [data.property, ...current]);
      setName("");
      setAddress("");
      setPostalCode("");
      setCity("");
      setSuccess("Fastigheten är skapad och kan nu kopplas till felanmälningar.");
    } catch {
      setError("Kunde inte kontakta servern");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl animate-fade-in space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-sand-200 bg-white p-7 shadow-premium-sm sm:p-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-petroleum-600">Fastigheter</p>
          <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.035em] sm:text-[36px] text-ink-950">Mina fastigheter</h1>
          <p className="mt-3 max-w-2xl text-ink-600">
            Bygg upp ditt bestånd och koppla varje felanmälan till rätt adress.
          </p>
        </div>
        <div className="rounded-2xl bg-petroleum-50 px-6 py-4 text-center">
          <p className="text-3xl font-semibold text-petroleum-600">{properties.length}</p>
          <p className="text-xs font-semibold uppercase tracking-wide text-petroleum-600">Registrerade</p>
        </div>
      </div>

      {(error || success) && (
        <div className={`rounded-2xl border p-4 text-sm font-medium ${error ? "border-danger-500 bg-danger-50 text-danger-600" : "border-success-500 bg-success-50 text-success-600"}`}>
          {error || success}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <section className="rounded-2xl border border-sand-200 bg-white p-7 shadow-premium-sm sm:p-8">
          <h2 className="text-[22px] font-semibold text-ink-950">Lägg till fastighet</h2>
          <p className="mt-2 text-sm text-ink-500">Ange grunddata som behövs för att styra ärenden rätt.</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <div>
              <label className="mb-1 block text-sm font-medium text-ink-700">Namn</label>
              <input
                type="text"
                required
                minLength={2}
                className="block w-full rounded-lg border border-sand-200 p-3 shadow-inner-sm outline-none transition-colors focus:border-petroleum-500 focus:ring-petroleum-500"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ex. Brf Solgläntan"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink-700">Adress</label>
              <input
                type="text"
                required
                minLength={3}
                className="block w-full rounded-lg border border-sand-200 p-3 shadow-inner-sm outline-none transition-colors focus:border-petroleum-500 focus:ring-petroleum-500"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="Ex. Storgatan 12"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[0.8fr_1.2fr]">
              <div>
                <label className="mb-1 block text-sm font-medium text-ink-700">Postnummer</label>
                <input
                  type="text"
                  className="block w-full rounded-lg border border-sand-200 p-3 shadow-inner-sm outline-none transition-colors focus:border-petroleum-500 focus:ring-petroleum-500"
                  value={postalCode}
                  onChange={(event) => setPostalCode(event.target.value)}
                  placeholder="111 22"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink-700">Ort</label>
                <input
                  type="text"
                  required
                  minLength={2}
                  className="block w-full rounded-lg border border-sand-200 p-3 shadow-inner-sm outline-none transition-colors focus:border-petroleum-500 focus:ring-petroleum-500"
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  placeholder="Stockholm"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-petroleum-700 px-8 py-3 font-semibold text-white shadow-premium-sm transition-all hover:bg-petroleum-700 hover:shadow-premium-sm disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitting ? "Sparar fastighet..." : "Spara fastighet"}
            </button>
          </form>
        </section>

        <section className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-premium-sm">
          <div className="border-b border-sand-100 bg-sand-50/70 p-6">
            <h2 className="text-lg font-semibold text-ink-950">Fastighetsregister</h2>
            <p className="mt-1 text-sm text-ink-500">Här visas fastigheter som kan användas i felanmälan.</p>
          </div>

          {loadingProperties ? (
            <div className="space-y-4 p-6">
              {[1, 2, 3].map((item) => (
                <div key={item} className="h-24 animate-pulse rounded-2xl bg-sand-100" />
              ))}
            </div>
          ) : properties.length > 0 ? (
            <div className="divide-y divide-sand-100">
              {properties.map((property) => (
                <article key={property.id} className="p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-ink-950">{property.name}</h3>
                      <p className="mt-2 text-sm leading-6 text-ink-600">
                        {property.address}
                        {property.postal_code ? `, ${property.postal_code}` : ""} {property.city}
                      </p>
                      <p className="mt-3 text-xs font-medium text-ink-400">
                        Skapad {dateFormatter.format(new Date(property.created_at))}
                      </p>
                    </div>
                    <span className="w-fit rounded-full border border-petroleum-100 bg-petroleum-50 px-3 py-1 text-xs font-semibold text-petroleum-600">
                      {property._count.tickets} ärenden
                    </span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="p-12 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-sand-50">
                <svg className="h-8 w-8 text-ink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-3" />
                </svg>
              </div>
              <p className="font-semibold text-ink-800">Inga fastigheter ännu.</p>
              <p className="mt-2 text-sm text-ink-500">Lägg till första fastigheten för att strukturera ärenden.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
