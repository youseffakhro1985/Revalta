import Link from "next/link";
import { getCurrentUser, isResident } from "@/lib/current-user";

export default async function ResidentPortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const resident = Boolean(user && isResident(user.role));

  return (
    <div className="space-y-6">
      <nav aria-label="Boendeportal" className="flex flex-wrap gap-2 rounded-2xl border border-sand-200 bg-white p-2 shadow-sm">
        <Link href="/dashboard/boendeportal" className="rounded-xl px-4 py-2 text-sm font-semibold text-ink-700 transition hover:bg-sand-50 hover:text-petroleum-800">
          {resident ? "Mina ärenden" : "Ärenden och boende"}
        </Link>
        <Link href="/dashboard/boendeportal/dokument" className="rounded-xl px-4 py-2 text-sm font-semibold text-ink-700 transition hover:bg-sand-50 hover:text-petroleum-800">
          {resident ? "Mina dokument" : "Boendedokument"}
        </Link>
        {resident ? (
          <>
            <Link href="/dashboard/boendeportal/avier" className="rounded-xl px-4 py-2 text-sm font-semibold text-ink-700 transition hover:bg-sand-50 hover:text-petroleum-800">
              Mina avier
            </Link>
            <Link href="/dashboard/boendeportal/bokningar" className="rounded-xl px-4 py-2 text-sm font-semibold text-ink-700 transition hover:bg-sand-50 hover:text-petroleum-800">
              Mina bokningar
            </Link>
            <Link href="/dashboard/boendeportal/konto" className="rounded-xl px-4 py-2 text-sm font-semibold text-ink-700 transition hover:bg-sand-50 hover:text-petroleum-800">
              Mitt konto
            </Link>
          </>
        ) : null}
      </nav>
      {children}
    </div>
  );
}
