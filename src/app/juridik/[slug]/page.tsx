import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

const pages: Record<string, { title: string; intro: string; sections: Array<{ title: string; body: string }> }> = {
  integritet: {
    title: "Integritetspolicy",
    intro: "Denna sida beskriver hur personuppgifter hanteras i Revalta. Texten är ett utkast tills formellt bolags- och avtalsinnehåll är fastställt.",
    sections: [
      { title: "Vilka uppgifter behandlas?", body: "Tjänsten kan behandla namn, e-post, telefonnummer, ärendeinformation, fastighetsuppgifter och tekniska loggar som behövs för att leverera systemet." },
      { title: "Varför behandlas uppgifterna?", body: "Uppgifterna används för felanmälan, användarkonton, spårbarhet, drift och återkoppling inom kundens organisation." },
      { title: "Lagring och säkerhet", body: "Data lagras i PostgreSQL med åtkomstkontroll, rollbaserad behörighet och auditlogg. Exakt lagring, underbiträden och kontaktuppgifter till personuppgiftsansvarig anges i kommande formell policy och personuppgiftsbiträdesavtal." },
      { title: "Kontakt", body: "Tills formell policy är publicerad: kontakta din organisations administratör eller support via kontaktuppgifterna på revalta.se." },
    ],
  },
  cookies: {
    title: "Cookiepolicy",
    intro: "Revalta använder nödvändiga cookies för inloggning, säkerhet och grundläggande funktion.",
    sections: [
      { title: "Nödvändiga cookies", body: "Sessionen lagras i en httpOnly-cookie så att användaren kan vara säkert inloggad i dashboarden." },
      { title: "Analys och marknadsföring", body: "Inga externa marknadsföringscookies är aktiverade i denna version. Om sådana läggs till ska användaren informeras och kunna samtycka." },
      { title: "Hantera cookies", body: "Du kan rensa cookies i webbläsaren. Då loggas du ut och behöver logga in igen." },
    ],
  },
  villkor: {
    title: "Användarvillkor",
    intro: "Dessa villkor är ett utkast och beskriver avsedd användning av Revalta tills formella avtalsvillkor är publicerade.",
    sections: [
      { title: "Tillåten användning", body: "Tjänsten är avsedd för fastighetsförvaltning, felanmälan, teamarbete och relaterad administration inom kundens organisation." },
      { title: "Ansvar", body: "Organisationen ansvarar för att användare har rätt behörighet och att registrerad information är korrekt." },
      { title: "Tillgänglighet", body: "Revalta byggs för hög tillgänglighet, men drift kan påverkas av underhåll, externa leverantörer eller nätverksproblem. Bindande SLA anges i separat avtal när det finns." },
    ],
  },
  gdpr: {
    title: "GDPR och personuppgiftsbiträde",
    intro: "Revalta har tekniska funktioner som stödjer spårbar personuppgiftshantering. Formellt personuppgiftsbiträdesavtal och registerförteckning kompletteras separat.",
    sections: [
      { title: "Roller", body: "Kundorganisationen är normalt personuppgiftsansvarig. Revalta är avsett att agera som personuppgiftsbiträde när tjänsten behandlar kundens data, under förutsättning att ett giltigt biträdesavtal finns." },
      { title: "Registerutdrag och radering", body: "Organisationen kan begära export eller radering enligt tillämplig lagstiftning och avtal. Självbetjäning för alla typer av begäranden är under fortsatt utveckling." },
      { title: "Tekniska skydd", body: "Systemet använder rollstyrning, auditlogg, säkra sessioner och begränsad åtkomst till känslig information. Detta är tekniska skyddsåtgärder, inte en juridisk certifiering." },
    ],
  },
};

export function generateStaticParams() {
  return Object.keys(pages).map((slug) => ({ slug }));
}

// Without this, every /juridik/[slug] page silently inherits the root
// layout's metadata — including `alternates.canonical: "/"` — which tells
// search engines each legal page is a duplicate of the homepage and its
// canonical version lives there instead. Give each page its own identity.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = pages[slug];
  if (!page) return {};

  const path = `/juridik/${slug}`;
  return {
    title: page.title,
    description: page.intro,
    alternates: { canonical: path },
    openGraph: {
      type: "article",
      title: page.title,
      description: page.intro,
      url: path,
    },
  };
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = pages[slug];
  if (!page) notFound();

  return (
    <main className="min-h-screen bg-sand-50">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <Link href="/" className="text-lg font-semibold tracking-tight text-petroleum-800">
          Revalta
        </Link>
        <article className="mt-8 rounded-3xl border border-sand-200 bg-white p-8 shadow-premium-sm">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-petroleum-700">Juridik</p>
          <h1 className="text-4xl font-semibold tracking-tight text-ink-950">{page.title}</h1>
          <p className="mt-4 text-lg leading-8 text-ink-600">{page.intro}</p>
          <div className="mt-8 space-y-6">
            {page.sections.map((section) => (
              <section key={section.title} className="rounded-2xl border border-sand-100 bg-sand-50/80 p-6">
                <h2 className="text-xl font-semibold text-ink-950">{section.title}</h2>
                <p className="mt-3 leading-7 text-ink-600">{section.body}</p>
              </section>
            ))}
          </div>
        </article>
      </div>
    </main>
  );
}
