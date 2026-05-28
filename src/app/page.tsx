import Link from 'next/link';
import { SiteFooter } from '@/components/site-footer';

export default function Home() {
  return (
    <>
      <main className="min-h-screen bg-sand-50 text-ink-900 font-sans selection:bg-petroleum-100 selection:text-petroleum-900">
        
        {/* Navbar */}
        <header className="sticky top-0 z-50 bg-sand-50/80 backdrop-blur-md border-b border-sand-200/50">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
            <Link href="/" className="text-2xl font-semibold tracking-tighter text-petroleum-600">Revalta</Link>
            <nav className="flex items-center gap-4">
              <Link href="/portal" className="text-sm font-medium text-ink-600 hover:text-petroleum-600 transition-colors">
                Boendeportal
              </Link>
              <Link href="/login" className="rounded-lg border border-sand-200 bg-white px-5 py-2.5 text-sm font-medium text-ink-800 transition-colors hover:bg-sand-100 shadow-sm">
                Logga in
              </Link>
            </nav>
          </div>
        </header>

        {/* Hero Section */}
        <section className="mx-auto grid max-w-7xl grid-cols-1 gap-12 px-6 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 lg:items-center lg:py-24">
          
          <div className="animate-fade-in-soft">
            <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-petroleum-600">
              Digitalt fastighetssystem
            </p>
            <h1 className="max-w-3xl text-4xl font-semibold leading-[1.15] tracking-tight text-ink-950 sm:text-5xl lg:text-6xl">
              Fastighetssystemet för modern svensk förvaltning
            </h1>
            <p className="mt-8 max-w-xl text-lg leading-relaxed text-ink-600">
              Revalta samlar felanmälan, fastigheter, ärenden, team och boendekommunikation i ett tydligt och professionellt system byggt för svenska fastighetsägare, BRF:er och förvaltare.
            </p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <Link href="/register" className="inline-flex justify-center rounded-xl bg-petroleum-600 px-6 py-3 text-center text-sm font-semibold text-white shadow-premium-sm transition-all hover:bg-petroleum-700 hover:shadow-premium-md duration-300">
                Boka demo
              </Link>
              <Link href="/portal" className="inline-flex justify-center rounded-xl border border-sand-200 bg-white px-6 py-3 text-center text-sm font-semibold text-ink-800 shadow-sm transition-colors hover:bg-sand-100 duration-300">
                Skapa felanmälan
              </Link>
            </div>
          </div>

          {/* Dashboard Preview / Feature list */}
          <div className="animate-slide-up-soft">
            <div className="rounded-3xl border border-sand-200 bg-white p-8 lg:p-10 shadow-premium-md">
              <p className="text-xs font-semibold uppercase tracking-widest text-ink-400 mb-6">Funktioner i plattformen</p>
              
              <div className="space-y-4">
                {[
                  {
                    title: "Digitalt fastighetsregister",
                    desc: "Full kontroll över ditt bestånd och dokumentation."
                  },
                  {
                    title: "Ärendehantering",
                    desc: "Följ felanmälan från skapad till slutförd arbetsorder."
                  },
                  {
                    title: "Boendeportal",
                    desc: "Smidig kommunikation och uppdateringar för hyresgäster."
                  },
                  {
                    title: "Team och arbetsflöden",
                    desc: "Tydlig rollfördelning och effektiv samverkan."
                  },
                  {
                    title: "Dokument, AI-stöd och uppföljning",
                    desc: "Smarta verktyg som förenklar vardagen för förvaltaren."
                  },
                ].map((item, i) => (
                  <div key={i} className="group rounded-2xl border border-sand-200 bg-sand-50/30 p-4 transition-all hover:bg-white hover:border-petroleum-200 hover:shadow-premium-sm">
                    <h3 className="text-sm font-semibold text-ink-900 group-hover:text-petroleum-700 transition-colors">{item.title}</h3>
                    <p className="mt-0.5 text-sm text-ink-500">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
