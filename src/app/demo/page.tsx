import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, ShieldCheck, Workflow } from "lucide-react";
import { DemoRequestForm } from "@/components/demo-request-form";
import { MarketingHeader } from "@/components/marketing-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "Boka demo | Revalta",
  description: "Boka en genomgång av Revalta och se hur felanmälan, arbetsorder, underhåll, dokument och boendeportal kan samlas i ett modernt fastighetssystem.",
  alternates: { canonical: "/demo" },
  openGraph: {
    title: "Boka demo | Revalta",
    description: "Se Revaltas arbetsflöden för modern fastighetsförvaltning.",
    url: "/demo",
    type: "website",
  },
};

const points = [
  "Felanmälan, prioritering och arbetsorder i ett sammanhängande flöde",
  "Fastigheter, underhåll, dokument och uppföljning på samma plattform",
  "Rollstyrda vyer för förvaltning och boendeportal",
];

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-[#FAFAF8] text-ink-950">
      <MarketingHeader />
      <main>
        <section className="border-b border-sand-200/80">
          <div className="mx-auto grid max-w-[1440px] gap-12 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-[0.9fr_1.1fr] lg:items-start lg:px-12 lg:py-24">
            <div className="max-w-xl lg:sticky lg:top-28">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-petroleum-700">Personlig genomgång</p>
              <h1 className="mt-5 font-display text-[42px] font-semibold leading-[1.02] tracking-[-0.052em] text-ink-950 sm:text-[56px] lg:text-[64px]">
                Se hur Revalta arbetar i praktiken.
              </h1>
              <p className="mt-6 max-w-lg text-base leading-7 text-ink-600 sm:text-lg">
                Boka en genomgång utifrån er vardag i förvaltningen. Fokus kan läggas på de arbetsflöden som är mest relevanta för ert bestånd och er organisation.
              </p>

              <div className="mt-8 space-y-3">
                {points.map((point) => (
                  <div key={point} className="flex gap-3 rounded-2xl border border-sand-200 bg-white/70 p-4">
                    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-petroleum-50 text-petroleum-700"><Check className="h-3.5 w-3.5" aria-hidden="true" /></span>
                    <p className="text-sm leading-6 text-ink-650">{point}</p>
                  </div>
                ))}
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-sand-200 bg-white p-4">
                  <Workflow className="h-5 w-5 text-petroleum-700" aria-hidden="true" />
                  <p className="mt-3 text-sm font-semibold text-ink-900">Utgå från verkliga processer</p>
                  <p className="mt-1 text-xs leading-5 text-ink-500">Se hur modulerna hänger ihop istället för isolerade skärmbilder.</p>
                </div>
                <div className="rounded-2xl border border-sand-200 bg-white p-4">
                  <ShieldCheck className="h-5 w-5 text-petroleum-700" aria-hidden="true" />
                  <p className="mt-3 text-sm font-semibold text-ink-900">Säker hantering</p>
                  <p className="mt-1 text-xs leading-5 text-ink-500">Förfrågan skickas via en skyddad serverkanal och lagras inte i webbläsaren.</p>
                </div>
              </div>

              <p className="mt-8 text-sm text-ink-500">
                Vill du hellre prova själv?{" "}
                <Link href="/register" className="inline-flex items-center gap-1 font-semibold text-petroleum-700 hover:text-petroleum-900">
                  Skapa konto <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </p>
            </div>

            <DemoRequestForm />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
