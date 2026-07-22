import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketingHeader } from "@/components/marketing-header";
import { SiteFooter } from "@/components/site-footer";

const pages: Record<string, { title: string; intro: string; sections: Array<{ title: string; body: string }> }> = {
  integritet: {
    title: "Integritetspolicy",
    intro: "Här beskriver vi hur Revalta behandlar personuppgifter på ett tryggt, transparent och ansvarsfullt sätt.",
    sections: [
      { title: "Vilka uppgifter behandlas?", body: "Vi behandlar uppgifter som namn, e-post, telefonnummer, ärendeinformation, fastighetsuppgifter och tekniska loggar som behövs för att leverera tjänsten." },
      { title: "Varför behandlas uppgifterna?", body: "Uppgifterna används för att hantera felanmälningar, administrera användarkonton, skapa spårbarhet, förbättra drift och ge korrekt återkoppling." },
      { title: "Lagring och säkerhet", body: "Data lagras i PostgreSQL och skyddas med åtkomstkontroll, rollbaserad behörighet och audit log. Åtkomst ges endast till behöriga användare." },
    ],
  },
  cookies: {
    title: "Cookiepolicy",
    intro: "Revalta använder endast nödvändiga cookies för inloggning, säkerhet och grundläggande funktion.",
    sections: [
      { title: "Nödvändiga cookies", body: "Sessionen lagras i en httpOnly-cookie så att användaren kan vara säkert inloggad i dashboarden." },
      { title: "Analys och marknadsföring", body: "Inga externa marknadsföringscookies är aktiverade i denna version. Om sådana läggs till ska användaren informeras och kunna samtycka." },
      { title: "Hantera cookies", body: "Du kan rensa cookies i webbläsaren. Då loggas du ut och behöver logga in igen." },
    ],
  },
  villkor: {
    title: "Användarvillkor",
    intro: "Dessa villkor beskriver hur Revalta får användas av organisationer, teammedlemmar och boende.",
    sections: [
      { title: "Tillåten användning", body: "Tjänsten ska användas för fastighetsservice, felanmälan, teamarbete och relaterad administration." },
      { title: "Ansvar", body: "Organisationen ansvarar för att användare har rätt behörighet och att information som registreras är korrekt." },
      { title: "Tillgänglighet", body: "Revalta är byggt för hög tillgänglighet, men drift kan påverkas av underhåll, externa leverantörer eller nätverksproblem." },
    ],
  },
  gdpr: {
    title: "GDPR och personuppgiftsbiträde",
    intro: "Revalta är byggt för att stödja seriös och spårbar personuppgiftshantering.",
    sections: [
      { title: "Roller", body: "Kundorganisationen är normalt personuppgiftsansvarig. Revalta agerar som systemstöd och personuppgiftsbiträde när tjänsten används för kundens data." },
      { title: "Registerutdrag och radering", body: "Organisationen kan begära export eller radering av uppgifter enligt tillämplig lagstiftning och avtal." },
      { title: "Tekniska skydd", body: "Systemet använder rollstyrning, audit log, säkra sessioner och begränsad åtkomst till känslig information." },
    ],
  },
};

export function generateStaticParams() {
  return Object.keys(pages).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = pages[slug];
  if (!page) return {};
  return {
    title: page.title,
    description: page.intro,
    alternates: { canonical: `/juridik/${slug}` },
    openGraph: { title: page.title, description: page.intro, url: `/juridik/${slug}` },
  };
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = pages[slug];
  if (!page) notFound();

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-ink-950">
      <MarketingHeader />
      <main id="main-content" className="mx-auto max-w-4xl px-5 py-14 sm:px-8 sm:py-20">
        <Link href="/" className="text-sm font-semibold text-petroleum-700 transition hover:text-petroleum-900">← Till startsidan</Link>
        <article className="mt-8 rounded-3xl border border-sand-200 bg-white p-6 shadow-premium-sm sm:p-10 lg:p-12">
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-petroleum-700">Juridik och villkor</p>
          <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-ink-950 sm:text-5xl">{page.title}</h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-ink-600">{page.intro}</p>
          <div className="mt-10 space-y-5 border-t border-sand-200 pt-8">
            {page.sections.map((section) => (
              <section key={section.title} className="rounded-2xl border border-sand-200 bg-sand-50/60 p-6 sm:p-7">
                <h2 className="font-display text-xl font-semibold text-ink-950">{section.title}</h2>
                <p className="mt-3 leading-7 text-ink-600">{section.body}</p>
              </section>
            ))}
          </div>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
