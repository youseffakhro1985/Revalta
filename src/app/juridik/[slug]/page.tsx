import Link from "next/link";
import { notFound } from "next/navigation";

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

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = pages[slug];
  if (!page) notFound();

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <Link href="/" className="font-bold text-brand-600">Revalta</Link>
        <article className="mt-8 rounded-3xl border border-slate-200 bg-white p-8 shadow-card">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">Juridik</p>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-950">{page.title}</h1>
          <p className="mt-4 text-lg leading-8 text-slate-600">{page.intro}</p>
          <div className="mt-8 space-y-6">
            {page.sections.map((section) => (
              <section key={section.title} className="rounded-2xl bg-slate-50 p-6">
                <h2 className="text-xl font-bold text-slate-950">{section.title}</h2>
                <p className="mt-3 leading-7 text-slate-600">{section.body}</p>
              </section>
            ))}
          </div>
        </article>
      </div>
    </main>
  );
}
