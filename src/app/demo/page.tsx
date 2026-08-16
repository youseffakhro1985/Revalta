import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2, Check, Wrench } from "lucide-react";
import { DemoRequestForm } from "@/components/demo-request-form";
import { MarketingHeader } from "@/components/marketing-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "Boka demo | Revalta",
  description: "Boka en genomgång av Revalta och se hur plattformen kan stödja er fastighetsförvaltning.",
};

const demoFocus = [
  "Er vardag och vilka arbetsflöden ni vill förenkla",
  "Fastigheter, ärenden, arbetsordrar och planering i samma struktur",
  "Boende, uthyrning, ekonomi, dokument och uppföljning utifrån era behov",
];

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-[#F7F7F3] text-ink-900">
      <MarketingHeader />
      <main>
        <section className="border-b border-sand-200 px-6 pb-16 pt-16 sm:pb-20 sm:pt-20 lg:pt-24">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.88fr_1.12fr] lg:items-start lg:gap-16">
            <div className="lg:sticky lg:top-28">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-petroleum-700">Boka demo</p>
              <h1 className="mt-4 max-w-xl font-display text-[42px] font-semibold leading-[1.04] tracking-[-0.045em] text-ink-950 sm:text-[52px]">
                Se Revalta utifrån er förvaltning.
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-ink-600 sm:text-lg">
                Berätta kort om er organisation, ert bestånd och vad ni vill förbättra. Därefter kan genomgången fokusera på de delar av Revalta som är relevanta för er.
              </p>

              <div className="mt-8 space-y-4">
                {demoFocus.map((item) => (
                  <div key={item} className="flex items-start gap-3 text-sm leading-6 text-ink-700">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-petroleum-100 text-petroleum-700">
                      <Check className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                    </span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>

              <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <div className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm">
                  <Building2 className="h-5 w-5 text-petroleum-700" strokeWidth={1.7} aria-hidden="true" />
                  <p className="mt-4 text-sm font-semibold text-ink-900">För fastighetsorganisationer</p>
                  <p className="mt-1 text-xs leading-5 text-ink-500">Fastighetsägare, förvaltare och BRF:er kan utgå från sina egna processer.</p>
                </div>
                <div className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm">
                  <Wrench className="h-5 w-5 text-petroleum-700" strokeWidth={1.7} aria-hidden="true" />
                  <p className="mt-4 text-sm font-semibold text-ink-900">Fokuserad genomgång</p>
                  <p className="mt-1 text-xs leading-5 text-ink-500">Välj vilka arbetsflöden och moduler som är viktigast att gå igenom.</p>
                </div>
              </div>

              <p className="mt-8 text-sm text-ink-500">
                Vill ni börja direkt? <Link href="/register" className="font-semibold text-petroleum-700 underline-offset-4 hover:underline">Skapa konto</Link> i stället.
              </p>
            </div>

            <div className="rounded-[28px] border border-sand-200 bg-white p-6 shadow-premium-md sm:p-8 lg:p-9">
              <div className="mb-7 border-b border-sand-200 pb-6">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-petroleum-600">Demoförfrågan</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-ink-950">Berätta vad ni vill se</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-500">Obligatoriska fält är namn, e-post och företag. Övriga uppgifter hjälper oss att göra genomgången mer relevant.</p>
              </div>
              <DemoRequestForm />
            </div>
          </div>
        </section>

        <section className="bg-white px-6 py-12">
          <div className="mx-auto flex max-w-7xl flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-ink-900">Revalta ska passa arbetssättet — inte tvärtom.</p>
              <p className="mt-1 text-sm text-ink-500">Se först plattformen. Skapa konto när ni är redo.</p>
            </div>
            <Link href="/#plattform" className="inline-flex items-center gap-2 text-sm font-semibold text-petroleum-700 transition hover:text-petroleum-900">
              Läs om plattformen <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
