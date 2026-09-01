import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-sand-200 bg-white px-6 py-16 font-sans text-ink-800">
      <div className="mx-auto flex max-w-7xl flex-col gap-10 md:flex-row md:items-start md:justify-between">
        <div className="max-w-xs">
          <p className="text-2xl font-semibold tracking-tighter text-petroleum-600">Revalta</p>
          <p className="mt-4 text-sm leading-relaxed text-ink-500">
            Ett professionellt fastighetssystem byggt för moderna svenska fastighetsägare och förvaltare.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-12 sm:grid-cols-3">
          <div>
            <h4 className="mb-4 text-sm font-semibold text-ink-950">Plattformen</h4>
            <nav className="flex flex-col gap-3 text-sm text-ink-500">
              <Link href="/demo" className="transition-colors hover:text-petroleum-600">Boka demo</Link>
              <Link href="/portal" className="transition-colors hover:text-petroleum-600">Boendeportal</Link>
              <Link href="/register" className="transition-colors hover:text-petroleum-600">Skapa konto</Link>
              <Link href="/login" className="transition-colors hover:text-petroleum-600">Logga in</Link>
            </nav>
          </div>

          <div className="col-span-2 sm:col-span-1">
            <h4 className="mb-4 text-sm font-semibold text-ink-950">Juridik & Villkor</h4>
            <nav className="flex flex-col gap-3 text-sm text-ink-500">
              <Link href="/juridik/integritet" className="transition-colors hover:text-petroleum-600">Integritet</Link>
              <Link href="/juridik/cookies" className="transition-colors hover:text-petroleum-600">Cookies</Link>
              <Link href="/juridik/villkor" className="transition-colors hover:text-petroleum-600">Användarvillkor</Link>
              <Link href="/juridik/gdpr" className="transition-colors hover:text-petroleum-600">GDPR</Link>
            </nav>
          </div>
        </div>
      </div>
      <div className="mx-auto mt-16 flex max-w-7xl flex-col items-center justify-between gap-4 border-t border-sand-200 pt-8 text-xs text-ink-500 sm:flex-row">
        <p className="text-center sm:text-left">&copy; {new Date().getFullYear()} Revalta. Alla rättigheter reserverade.</p>
        <p className="font-medium">Svensk Proptech</p>
      </div>
    </footer>
  );
}
