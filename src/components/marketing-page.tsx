import Link from "next/link";

type MarketingPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  bullets: string[];
};

export function MarketingPage({ eyebrow, title, description, bullets }: MarketingPageProps) {
  return (
    <main className="min-h-screen bg-[#f7f6f2] px-6 py-10 text-slate-950">
      <div className="mx-auto max-w-5xl">
        <nav className="flex items-center justify-between">
          <Link href="/" className="text-lg font-bold">Revalta</Link>
          <div className="flex gap-2">
            <Link href="/logga-in" className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-white">Logga in</Link>
            <Link href="/registrera" className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white">Registrera</Link>
          </div>
        </nav>

        <section className="py-20">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand-700">{eyebrow}</p>
          <h1 className="mt-5 max-w-3xl text-5xl font-bold tracking-tight">{title}</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">{description}</p>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {bullets.map((bullet) => (
              <div key={bullet} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card">
                <p className="font-semibold text-slate-950">{bullet}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
