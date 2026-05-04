import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f7f6f2] text-slate-950">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-sm font-bold text-white">R</span>
          <span className="text-lg font-semibold tracking-tight">Revalta</span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
          <Link href="/funktioner">Funktioner</Link>
          <Link href="/priser">Priser</Link>
          <Link href="/om-oss">Om oss</Link>
          <Link href="/kontakt">Kontakt</Link>
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/logga-in" className="text-sm font-semibold text-slate-700">Logga in</Link>
          <Link href="/registrera" className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-card hover:bg-slate-800">
            Kom igång
          </Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-12 px-6 py-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div className="animate-slide-up">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand-700">AI-driven fastighetsförvaltning</p>
          <h1 className="mt-5 max-w-4xl text-5xl font-extrabold tracking-tight text-slate-950 sm:text-6xl">
            Premium SaaS för BRF:er och fastighetsbolag.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
            Revalta samlar felanmälan, AI-prioritering, dashboard och fastighetsdata i en trygg plattform byggd för modern förvaltning.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/registrera" className="rounded-xl bg-slate-950 px-6 py-3 text-center text-sm font-semibold text-white shadow-card hover:bg-slate-800">
              Registrera företag
            </Link>
            <Link href="/demo" className="rounded-xl border border-slate-200 bg-white px-6 py-3 text-center text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50">
              Boka demo
            </Link>
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-card-lg">
          <div className="rounded-[1.5rem] bg-slate-950 p-6 text-white">
            <p className="text-sm text-slate-400">AI-förslag</p>
            <h2 className="mt-3 text-2xl font-bold">Misstänkt vattenläckage</h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {[
                ["Kategori", "VVS"],
                ["Prioritet", "Hög"],
                ["Risk", "84/100"],
                ["Nästa steg", "Manuell bedömning"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{label}</p>
                  <p className="mt-2 font-semibold">{value}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {["Skyddade routes", "Audit logs", "Server-side permissions"].map((item) => (
              <div key={item} className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm font-semibold text-slate-700">
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
