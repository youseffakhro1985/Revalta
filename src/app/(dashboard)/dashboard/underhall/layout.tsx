import Link from "next/link";

export default function MaintenanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <nav aria-label="Underhåll" className="flex flex-wrap gap-2 rounded-2xl border border-sand-200 bg-white p-2 shadow-sm">
        <Link href="/dashboard/underhall" className="rounded-xl px-4 py-2 text-sm font-semibold text-ink-700 transition hover:bg-sand-50 hover:text-petroleum-800">Långsiktig underhållsplan</Link>
        <Link href="/dashboard/underhall/service" className="rounded-xl px-4 py-2 text-sm font-semibold text-ink-700 transition hover:bg-sand-50 hover:text-petroleum-800">Komponentservice och automatik</Link>
        <Link href="/dashboard/underhall/portfolio" className="rounded-xl px-4 py-2 text-sm font-semibold text-ink-700 transition hover:bg-sand-50 hover:text-petroleum-800">Portföljöversikt</Link>
      </nav>
      {children}
    </div>
  );
}
