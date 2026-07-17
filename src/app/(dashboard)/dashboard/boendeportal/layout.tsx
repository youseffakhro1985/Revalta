import Link from "next/link";

export default function ResidentPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <nav aria-label="Boendeportal" className="flex flex-wrap gap-2 rounded-2xl border border-sand-200 bg-white p-2 shadow-sm">
        <Link href="/dashboard/boendeportal" className="rounded-xl px-4 py-2 text-sm font-semibold text-ink-700 transition hover:bg-sand-50 hover:text-petroleum-800">
          Ärenden och boende
        </Link>
        <Link href="/dashboard/boendeportal/dokument" className="rounded-xl px-4 py-2 text-sm font-semibold text-ink-700 transition hover:bg-sand-50 hover:text-petroleum-800">
          Boendedokument
        </Link>
      </nav>
      {children}
    </div>
  );
}
