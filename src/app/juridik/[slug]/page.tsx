import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

type LegalPageDefinition = {
  title: string;
  intro: string;
  status: string;
  lastUpdated: string;
  sections: Array<{ title: string; body: string }>;
};

const pages: Record<string, LegalPageDefinition> = {
  integritet: {
    title: "Integritetspolicy",
    intro: "Denna sida beskriver hur personuppgifter är avsedda att hanteras i Revalta. Texten är ett transparensutkast tills formell juridisk identitet, kontaktvägar, underbiträden, lagringstider och avtalsvillkor är fastställda och verifierade.",
    status: "Utkast – inte bindande juridiskt dokument",
    lastUpdated: "1 september 2026",
    sections: [
      {
        title: "Roller och ansvar",
        body: "Kundorganisationen är normalt personuppgiftsansvarig för uppgifter som organisationen registrerar och behandlar i Revalta. Revalta är avsett att behandla sådan kunddata som personuppgiftsbiträde enligt dokumenterade instruktioner och ett separat personuppgiftsbiträdesavtal. För eventuell behandling för Revaltas egna ändamål ska ansvar, rättslig grund och kontaktuppgifter beskrivas uttryckligen i den slutliga policyn.",
      },
      {
        title: "Vilka uppgifter kan behandlas?",
        body: "Tjänsten kan behandla namn, e-post, telefonnummer, användar- och behörighetsuppgifter, felanmälningar, arbetsorder, kommentarer, dokumentmetadata, fastighets- och avtalsuppgifter samt tekniska säkerhets- och auditloggar. Vilka uppgifter som faktiskt behandlas beror på vilka moduler kundorganisationen använder.",
      },
      {
        title: "Ändamål och rättslig grund",
        body: "Kundorganisationen ansvarar normalt för att fastställa rättslig grund för sin behandling i tjänsten. Behandlingen kan exempelvis behövas för avtal, rättsliga förpliktelser eller berättigade intressen beroende på kundens verksamhet och den registrerades relation till kunden. Revalta ska som biträde endast behandla kunddata inom ramen för avtalade instruktioner.",
      },
      {
        title: "Mottagare och underbiträden",
        body: "Tekniska leverantörer kan behöva behandla begränsade uppgifter för exempelvis databas, drift, lagring, e-post eller betalningsfunktioner. En aktuell och verifierad lista över underbiträden, behandlingsplats och eventuell överföringsmekanism ska publiceras eller biläggas biträdesavtalet innan kommersiell behandling som kräver detta aktiveras.",
      },
      {
        title: "Lagring och gallring",
        body: "Revalta innehåller tekniska funktioner för livscykelhantering, radering och auditspårning, men bindande lagrings- och gallringsfrister ska fastställas per datakategori i avtal och intern registerförteckning. Uppgifter ska inte sparas längre än vad ändamål, avtal eller tillämplig lag kräver.",
      },
      {
        title: "Säkerhet",
        body: "Tjänsten använder bland annat roll- och tenantstyrning, säkra sessioner, åtkomstkontroll, auditlogg, korrelations-ID, validering av uppladdade filer och privata cache-direktiv för känsliga svar. Tekniska skydd minskar risk men utgör inte i sig en juridisk certifiering eller garanti mot incidenter.",
      },
      {
        title: "Registrerades rättigheter",
        body: "Beroende på rättslig grund och situation kan en registrerad ha rätt till information, tillgång, rättelse, radering, begränsning, invändning och dataportabilitet. Begäranden som avser en kundorganisations data ska normalt hanteras av den kundorganisation som är personuppgiftsansvarig, med teknisk assistans från Revalta enligt biträdesavtal.",
      },
      {
        title: "Klagomål och kontakt",
        body: "Registrerade har rätt att lämna klagomål till behörig dataskyddsmyndighet, i Sverige Integritetsskyddsmyndigheten (IMY). Verifierad juridisk identitet, integritetskontakt och kontaktväg för Revalta ska anges här innan denna policy görs bindande. Tills dess ska frågor om kunddata i första hand riktas till den berörda kundorganisationens administratör.",
      },
    ],
  },
  cookies: {
    title: "Cookiepolicy",
    intro: "Revalta använder nödvändiga cookies för inloggning, säkerhet och grundläggande funktion. Denna sida beskriver nuvarande tekniska användning och ska uppdateras innan nya analys- eller marknadsföringstekniker aktiveras.",
    status: "Teknisk nulägesbeskrivning",
    lastUpdated: "1 september 2026",
    sections: [
      {
        title: "Nödvändiga cookies",
        body: "En säker httpOnly-cookie används för att hålla en autentiserad session. Säkerhetsinställningar och cookie-livslängd styrs av servern. Om sessionscookien tas bort behöver användaren normalt logga in igen.",
      },
      {
        title: "Analys och marknadsföring",
        body: "Inga externa marknadsföringscookies ska betraktas som godkända enbart genom denna text. Om analys-, annonserings- eller annan icke-nödvändig spårning aktiveras ska cookieinventering, samtyckesflöde och policy uppdateras innan tekniken används där samtycke krävs.",
      },
      {
        title: "Lokala lagringsmekanismer",
        body: "Webbläsaren kan använda teknisk lagring för gränssnitt eller tillfälligt tillstånd. Sådan lagring ska inte användas som en genväg runt de krav som gäller för cookies eller liknande spårningstekniker.",
      },
      {
        title: "Hantera cookies",
        body: "Du kan rensa eller blockera cookies i webbläsaren. Blockering av nödvändiga sessionscookies kan göra att inloggning och andra skyddade funktioner inte fungerar.",
      },
    ],
  },
  villkor: {
    title: "Användarvillkor",
    intro: "Dessa villkor är ett produktutkast och beskriver avsedd användning av Revalta. De ersätter inte ett undertecknat kundavtal, orderformulär, SLA eller personuppgiftsbiträdesavtal.",
    status: "Utkast – inte bindande kundavtal",
    lastUpdated: "1 september 2026",
    sections: [
      {
        title: "Tillåten användning",
        body: "Tjänsten är avsedd för fastighetsförvaltning, felanmälan, arbetsorder, dokument, avtal, ekonomi, teamarbete och relaterad administration inom kundorganisationens behöriga användarkrets.",
      },
      {
        title: "Konton och behörighet",
        body: "Kundorganisationen ansvarar för att användarkonton tilldelas rätt personer och rätt roller, att åtkomst tas bort när den inte längre behövs och att användare skyddar sina autentiseringsuppgifter. Försök att kringgå åtkomstkontroller, störa tjänsten eller komma åt andra organisationers data är inte tillåtet.",
      },
      {
        title: "Kunddata och riktighet",
        body: "Kundorganisationen ansvarar för att den har rätt att registrera och behandla information som förs in i tjänsten samt för den verksamhetsmässiga riktigheten i uppgifter, beslut och underlag. Automatiska förslag och AI-stöd ska inte ersätta mänsklig kontroll när ett beslut kräver professionell eller rättslig bedömning.",
      },
      {
        title: "Tillgänglighet och externa beroenden",
        body: "Revalta byggs för robust drift men kan påverkas av planerat underhåll, internet, databas-, e-post-, lagrings-, betalnings- och andra externa leverantörer. Bindande servicenivåer, supporttider, återställningsmål och ersättningsregler ska endast följa av separat avtal när sådant finns.",
      },
      {
        title: "Pris, abonnemang och betalning",
        body: "Pris, plan, inkluderad användning, fakturering, uppsägning och eventuella överdebiteringar ska fastställas i aktuell prislista eller orderformulär. Den tekniska produktkonfigurationen ska inte ensam tolkas som ett bindande kommersiellt erbjudande.",
      },
      {
        title: "Ändringar och upphörande",
        body: "Bindande regler för avtalsperiod, uppsägning, dataexport, radering efter avtalets slut och väsentliga ändringar ska anges i kundavtalet. Produktfunktioner kan utvecklas över tid, men avtalsmässiga åtaganden ska hanteras enligt det avtal som gäller för kunden.",
      },
    ],
  },
  gdpr: {
    title: "GDPR och personuppgiftsbiträde",
    intro: "Revalta har tekniska funktioner som stödjer spårbar personuppgiftshantering. Ett bindande personuppgiftsbiträdesavtal, registerförteckning och verifierad underbiträdeslista ska komplettera denna sida före full kommersiell databehandling.",
    status: "Readiness-information – inte ett personuppgiftsbiträdesavtal",
    lastUpdated: "1 september 2026",
    sections: [
      {
        title: "Roller",
        body: "Kundorganisationen är normalt personuppgiftsansvarig för kunddata. Revalta är avsett att agera som personuppgiftsbiträde när tjänsten behandlar sådan data på kundens instruktioner. Den slutliga ansvarsfördelningen ska dokumenteras i avtal för respektive kundrelation.",
      },
      {
        title: "Biträdesavtalets minimipunkter",
        body: "Det bindande biträdesavtalet bör bland annat fastställa föremål och varaktighet, behandlingens art och ändamål, typer av personuppgifter, kategorier av registrerade, dokumenterade instruktioner, sekretess, säkerhetsåtgärder, underbiträden, assistans vid rättighetsbegäranden, incidenter, radering eller återlämning samt revisions- och informationsskyldigheter.",
      },
      {
        title: "Registerutdrag, rättelse och radering",
        body: "Systemet ska ge kundorganisationen praktiska möjligheter att söka, exportera, rätta och radera data när det är förenligt med lag, avtal, tekniska beroenden och krav på bevarande. Självbetjäning för alla datatyper är inte ett löfte förrän respektive flöde är verifierat i produktion.",
      },
      {
        title: "Incidenthantering",
        body: "Säkerhets- och auditloggar ska stödja utredning och spårbarhet. Rutiner för klassificering, eskalering, kontaktpersoner, dokumentation och underrättelse till personuppgiftsansvarig ska fastställas organisatoriskt; teknisk loggning ensam uppfyller inte hela incidentprocessen.",
      },
      {
        title: "Underbiträden och internationella överföringar",
        body: "En verifierad förteckning över relevanta leverantörer, behandlingsplatser och överföringsmekanismer ska finnas innan bindande biträdesvillkor publiceras. Nya underbiträden ska hanteras enligt den informations- och invändningsprocess som avtalas med kunden.",
      },
      {
        title: "Tekniska och organisatoriska skydd",
        body: "Revalta använder bland annat tenant- och rollstyrning, säkra sessioner, privata cache-direktiv, validering, auditlogg, strukturerad loggning och begränsad åtkomst till känsliga funktioner. Organisatoriska processer, behörighetsrecensioner, backup/restore-verifiering och leverantörsstyrning behöver ingå i den samlade säkerhetsmodellen.",
      },
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
        <article className="mt-8 rounded-3xl border border-sand-200 bg-white p-8 shadow-premium-sm sm:p-10">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-petroleum-700">Juridik</p>
          <h1 className="text-4xl font-semibold tracking-tight text-ink-950">{page.title}</h1>
          <p className="mt-4 text-lg leading-8 text-ink-600">{page.intro}</p>

          <div className="mt-6 flex flex-col gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between">
            <strong>{page.status}</strong>
            <span>Senast uppdaterad {page.lastUpdated}</span>
          </div>

          <div className="mt-8 space-y-6">
            {page.sections.map((section) => (
              <section key={section.title} className="rounded-2xl border border-sand-100 bg-sand-50/80 p-6">
                <h2 className="text-xl font-semibold text-ink-950">{section.title}</h2>
                <p className="mt-3 leading-7 text-ink-600">{section.body}</p>
              </section>
            ))}
          </div>

          <p className="mt-8 text-sm leading-6 text-ink-500">
            Bindande kund-, integritets- och personuppgiftsvillkor gäller först när de har fastställts och publicerats med verifierad avtalspart och kontaktinformation.
          </p>
        </article>
      </div>
    </main>
  );
}
