import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  BarChart3,
  Building2,
  Check,
  ClipboardCheck,
  FileCheck2,
  Landmark,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { DashboardPreview } from "@/components/landing/dashboard-preview";
import { MarketingHeader } from "@/components/marketing-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: { url: "/" },
};

const modules = [
  {
    icon: Building2,
    title: "Fastigheter",
    description: "Samla bestånd, byggnader, ytor och teknisk information i en tydlig struktur.",
  },
  {
    icon: ClipboardCheck,
    title: "Ärenden & arbetsorder",
    description: "Prioritera, tilldela och följ upp varje åtgärd från felanmälan till avslut.",
  },
  {
    icon: FileCheck2,
    title: "Avtal & dokument",
    description: "Rätt avtal, protokoll och ritning kopplad till rätt fastighet och tidpunkt.",
  },
  {
    icon: Landmark,
    title: "Ekonomi",
    description: "Skapa ett stabilt beslutsunderlag med kostnader, budget och fakturaflöden.",
  },
  {
    icon: BarChart3,
    title: "Statistik",
    description: "Följ nyckeltal, vakans och utveckling utan att bygga egna kalkylblad.",
  },
  {
    icon: Sparkles,
    title: "AI-insikter",
    description: "Upptäck avvikelser och få konkreta förslag med människan kvar i kontroll.",
  },
];

const assurances = [
  { icon: ShieldCheck, label: "Svensk datahantering" },
  { icon: Users, label: "Byggt för hela förvaltningsteamet" },
  { icon: Check, label: "GDPR-anpassade arbetsflöden" },
];

export default function Home() {
  return (
    <>
      <main id="main-content" className="min-h-screen overflow-hidden bg-[#FAFAF8] text-ink-950 selection:bg-petroleum-100 selection:text-petroleum-950">
        <MarketingHeader />

        <section className="relative border-b border-sand-200/80">
          <div className="pointer-events-none absolute inset-y-0 left-[7%] hidden w-px bg-sand-200/70 xl:block" />
          <div className="pointer-events-none absolute inset-y-0 right-[7%] hidden w-px bg-sand-200/70 xl:block" />

          <div className="mx-auto grid max-w-[1440px] items-center gap-14 px-5 pb-20 pt-16 sm:px-8 sm:pb-24 sm:pt-20 lg:grid-cols-[0.82fr_1.18fr] lg:gap-12 lg:px-12 lg:pb-28 lg:pt-24 xl:gap-20">
            <div className="relative z-10 max-w-[610px]">
              <div className="mb-7 flex items-center gap-3">
                <span className="h-px w-8 bg-petroleum-600" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-petroleum-700">
                  För svensk fastighetsförvaltning
                </span>
              </div>

              <h1 className="font-display text-[44px] font-semibold leading-[1.04] tracking-[-0.045em] text-ink-950 sm:text-[56px] lg:text-[62px] xl:text-[68px]">
                Ett lugnare sätt att förvalta fastigheter.
              </h1>
              <p className="mt-7 max-w-[560px] text-[17px] leading-8 text-ink-600 sm:text-[18px]">
                Revalta samlar fastigheter, ärenden, avtal och ekonomi i ett genomtänkt system – byggt för svenska fastighetsägare, BRF:er och förvaltare.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/register"
                  className="inline-flex h-12 items-center justify-center gap-2.5 rounded-lg bg-petroleum-700 px-5 text-[14px] font-semibold text-white shadow-premium-sm transition-colors hover:bg-petroleum-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-600/30 focus-visible:ring-offset-2"
                >
                  Boka en personlig visning
                  <ArrowRight aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
                </Link>
                <Link
                  href="#plattform"
                  className="inline-flex h-12 items-center justify-center rounded-lg border border-sand-300 bg-white px-5 text-[14px] font-semibold text-ink-700 shadow-[0_1px_2px_rgba(17,34,31,0.03)] transition-colors hover:border-sand-400 hover:text-petroleum-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-600/20 focus-visible:ring-offset-2"
                >
                  Se plattformen
                </Link>
              </div>

              <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-sand-200 pt-6">
                {[
                  "Fastighetsägare",
                  "BRF",
                  "Förvaltare",
                ].map((audience) => (
                  <span key={audience} className="flex items-center gap-2 text-[12px] font-medium text-ink-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-petroleum-500" />
                    {audience}
                  </span>
                ))}
              </div>
            </div>

            <div id="plattform" className="relative scroll-mt-28 lg:translate-x-3 xl:translate-x-6">
              <div className="absolute -left-8 -top-8 h-20 w-20 border-l border-t border-sand-300/80" aria-hidden="true" />
              <DashboardPreview />
            </div>
          </div>
        </section>

        <section aria-label="Trygghet och anpassning" className="border-b border-sand-200/80 bg-white">
          <div className="mx-auto grid max-w-[1440px] divide-y divide-sand-200 px-5 sm:px-8 md:grid-cols-3 md:divide-x md:divide-y-0 lg:px-12">
            {assurances.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="flex items-center gap-3 py-5 md:justify-center md:px-5">
                  <Icon aria-hidden="true" className="h-4 w-4 text-petroleum-700" strokeWidth={1.65} />
                  <span className="text-[12px] font-medium text-ink-600">{item.label}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section id="funktioner" className="scroll-mt-24 bg-white py-24 sm:py-28 lg:py-32">
          <div className="mx-auto max-w-[1320px] px-5 sm:px-8 lg:px-12">
            <div className="grid gap-8 border-b border-sand-200 pb-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-petroleum-700">
                  En sammanhållen plattform
                </p>
                <h2 className="mt-4 max-w-[640px] font-display text-[36px] font-semibold leading-[1.12] tracking-[-0.035em] text-ink-950 sm:text-[44px]">
                  Mindre administration. Mer kontroll.
                </h2>
              </div>
              <p className="max-w-[590px] text-[16px] leading-7 text-ink-600 lg:justify-self-end">
                Revalta gör vardagen tydligare för både strategisk och operativ förvaltning. Informationen följer fastigheten, inte enskilda inkorgar eller kalkylblad.
              </p>
            </div>

            <div className="grid border-b border-sand-200 sm:grid-cols-2 lg:grid-cols-3">
              {modules.map((module, index) => {
                const Icon = module.icon;
                return (
                  <article
                    key={module.title}
                    className={`group min-h-[240px] border-sand-200 px-1 py-9 sm:p-8 lg:p-9 ${
                      index < 5 ? "border-b" : ""
                    } ${index === 4 ? "sm:border-b-0" : ""} ${
                      index >= 3 ? "lg:border-b-0" : ""
                    } ${index % 2 === 0 ? "sm:border-r" : "sm:border-r-0"} ${
                      index % 3 !== 2 ? "lg:border-r" : "lg:border-r-0"
                    }`}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-sand-200 bg-sand-50 text-petroleum-700 transition-colors group-hover:border-petroleum-200 group-hover:bg-petroleum-50">
                      <Icon aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={1.6} />
                    </div>
                    <h3 className="mt-6 font-display text-[20px] font-semibold tracking-[-0.02em] text-ink-950">
                      {module.title}
                    </h3>
                    <p className="mt-3 max-w-[330px] text-[14px] leading-6 text-ink-500">
                      {module.description}
                    </p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="border-y border-sand-200 bg-[#F3F3EE] py-20 sm:py-24">
          <div className="mx-auto grid max-w-[1320px] gap-10 px-5 sm:px-8 lg:grid-cols-[1fr_auto] lg:items-center lg:px-12">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-petroleum-700">
                Se Revalta i er förvaltning
              </p>
              <h2 className="mt-4 max-w-[720px] font-display text-[34px] font-semibold leading-tight tracking-[-0.035em] text-ink-950 sm:text-[42px]">
                Ett seriöst system ska kännas enkelt från första dagen.
              </h2>
            </div>
            <Link
              href="/register"
              className="inline-flex h-12 w-fit items-center gap-2.5 rounded-lg bg-petroleum-700 px-5 text-[14px] font-semibold text-white transition-colors hover:bg-petroleum-800"
            >
              Boka personlig visning
              <ArrowRight aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
