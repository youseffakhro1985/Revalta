import { Building2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function FunktionerPage() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-base font-semibold leading-7 text-primary">Plattformens kärna</h2>
        <p className="mt-2 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
          Allt du behöver för modern förvaltning
        </p>
        <p className="mt-6 text-lg leading-8 text-gray-600">
          Revalta är utformat från grunden för att minimera manuellt arbete och maximera datadrivna beslut.
        </p>
      </div>

      <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-none">
        <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-16 lg:max-w-none lg:grid-cols-3">
          <div className="flex flex-col">
            <dt className="flex items-center gap-x-3 text-base font-semibold leading-7 text-gray-900">
              <Building2 className="h-5 w-5 flex-none text-primary" />
              Fastighetsregister
            </dt>
            <dd className="mt-4 flex flex-auto flex-col text-base leading-7 text-gray-600">
              <p className="flex-auto">Ett komplett register för dina fastigheter, trappuppgångar och ytor. Få en visuell överblick över alla dina tillgångar.</p>
            </dd>
          </div>
          <div className="flex flex-col">
            <dt className="flex items-center gap-x-3 text-base font-semibold leading-7 text-gray-900">
              <CheckCircle2 className="h-5 w-5 flex-none text-primary" />
              AI-Felanmälan
            </dt>
            <dd className="mt-4 flex flex-auto flex-col text-base leading-7 text-gray-600">
              <p className="flex-auto">När en hyresgäst felanmäler något så läser vår AI direkt igenom och bedömer risk, prioritet och kategori automatiskt.</p>
            </dd>
          </div>
          <div className="flex flex-col">
            <dt className="flex items-center gap-x-3 text-base font-semibold leading-7 text-gray-900">
              <Building2 className="h-5 w-5 flex-none text-primary" />
              Arbetsordrar & Leverantörer
            </dt>
            <dd className="mt-4 flex flex-auto flex-col text-base leading-7 text-gray-600">
              <p className="flex-auto">Skicka ärenden vidare till externa leverantörer och hantera kommunikationen utan att lämna plattformen.</p>
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-32 flex justify-center">
        <Button href="/register" className="px-8 py-3 text-base">Testa Revalta gratis</Button>
      </div>
    </div>
  );
}
