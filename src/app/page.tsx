import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <Link href="/" className="text-2xl font-extrabold tracking-tight">Revalta</Link>
        <nav className="flex items-center gap-3">
          <Link href="/portal" className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-950 transition-colors hover:bg-slate-100">
            Boendeportal
          </Link>
          <Link href="/login" className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/20">
            Logga in
          </Link>
        </nav>
      </div>

      <section className="mx-auto grid max-w-7xl grid-cols-1 gap-12 px-6 py-20 lg:grid-cols-[1fr_420px] lg:items-center">
        <div>
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.28em] text-brand-200">Premium SaaS för fastighetsservice</p>
          <h1 className="max-w-4xl text-6xl font-extrabold leading-[1.02] tracking-tight sm:text-7xl">
            Ett modernt kontrollrum för fastigheter, team och ärenden.
          </h1>
          <p className="mt-7 max-w-2xl text-xl leading-9 text-slate-300">
            Revalta samlar felanmälan, fastighetsregister, teamstyrning, audit log, AI-insikter, bilagor och billing i en seriös helhetsplattform.
          </p>
          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <Link href="/register" className="rounded-2xl bg-brand-600 px-7 py-4 text-center font-bold text-white shadow-card-lg transition-colors hover:bg-brand-700">
              Starta organisation
            </Link>
            <Link href="/portal" className="rounded-2xl border border-white/15 bg-white/10 px-7 py-4 text-center font-bold text-white transition-colors hover:bg-white/15">
              Skapa felanmälan som boende
            </Link>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white p-7 text-slate-950 shadow-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">Live-moduler</p>
          <div className="mt-6 space-y-4">
            {[
              "Company & team med roller",
              "Fastigheter och ärendeflöde",
              "Boendeportal med referensnummer",
              "AI-analys, bilagor och audit log",
              "Billing och integrationsstatus",
            ].map((item) => (
              <div key={item} className="rounded-2xl border border-slate-100 bg-slate-50 p-4 font-semibold text-slate-800">
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
