import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function HomePage() {
  return (
    <main>
      <section className="mx-auto max-w-7xl px-6 py-24">
        <div className="max-w-3xl">
          <p className="mb-4 text-sm font-medium text-gray-500">
            AI-driven fastighetsförvaltning
          </p>

          <h1 className="text-5xl font-semibold tracking-tight text-gray-950 md:text-7xl">
            Ett modernare sätt att styra fastigheter, ärenden och drift.
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-gray-600">
            Revalta samlar fastigheter, felanmälningar, arbetsorder, dokument,
            team och AI-insikter i en premium SaaS-plattform för BRF:er,
            fastighetsbolag och förvaltningsorganisationer.
          </p>

          <div className="mt-10 flex gap-4">
            <Button href="/register">Starta registrering</Button>
            <Button href="/demo" variant="secondary">Boka demo</Button>
          </div>
        </div>

        <div className="mt-20 grid gap-6 md:grid-cols-3">
          <Card>
            <h3 className="text-lg font-semibold">Felanmälan</h3>
            <p className="mt-3 text-sm leading-6 text-gray-600">
              Skapa, prioritera och följ ärenden med tydliga statusflöden.
            </p>
          </Card>

          <Card>
            <h3 className="text-lg font-semibold">AI-insikter</h3>
            <p className="mt-3 text-sm leading-6 text-gray-600">
              Få förslag på kategori, prioritet, risk och nästa steg.
            </p>
          </Card>

          <Card>
            <h3 className="text-lg font-semibold">Admin-kontroll</h3>
            <p className="mt-3 text-sm leading-6 text-gray-600">
              Godkänn företag, hantera användare och följ audit logs.
            </p>
          </Card>
        </div>
      </section>
    </main>
  );
}
