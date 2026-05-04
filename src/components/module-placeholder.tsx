import Link from "next/link";

type ModulePlaceholderProps = {
  title: string;
  eyebrow: string;
  description: string;
  items: string[];
};

export function ModulePlaceholder({ title, eyebrow, description, items }: ModulePlaceholderProps) {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-card">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-700">{eyebrow}</p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-950">{title}</h1>
        <p className="mt-3 max-w-2xl text-slate-600">{description}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {items.map((item) => (
          <div key={item} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
            <p className="font-semibold text-slate-950">{item}</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Grundstruktur finns för MVP och kan kopplas till full backend i nästa iteration.
            </p>
          </div>
        ))}
      </div>

      <Link href="/dashboard/felanmalan" className="inline-flex rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white">
        Skapa första operativa ärendet
      </Link>
    </div>
  );
}
