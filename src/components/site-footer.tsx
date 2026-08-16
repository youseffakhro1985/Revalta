import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-sand-200 bg-white px-6 py-16 text-ink-800 font-sans">
      <div className="mx-auto flex max-w-7xl flex-col gap-10 md:flex-row md:items-start md:justify-between">
        <div className="max-w-xs">
          <p className="text-2xl font-semibold tracking-tighter text-petroleum-600">Revalta</p>
          <p className="mt-4 text-sm leading-relaxed text-ink-500">
            Ett professionellt fastighetssystem byggt för moderna svenska fastighetsägare och förvaltare.
          </p>
        </div>
        
        <div className="grid grid-cols-2 gap-12 sm:grid-cols-3">
          <div>
            <h4 className="text-sm font-semibold text-ink-950 mb-4">Plattformen</h4>
            <nav className="flex flex-col gap-3 text-sm text-ink-500">
              <Link href="/portal" className="hover:text-petroleum-600 transition-colors">Boendeportal</Link>
              <Link href="/register" className="hover:text-petroleum-600 transition-colors">Skapa konto</Link>
              <Link href="/login" className="hover:text-petroleum-600 transition-colors">Logga in</Link>
            </nav>
          </div>
          
          <div className="col-span-2 sm:col-span-1">
            <h4 className="text-sm font-semibold text-ink-950 mb-4">Juridik & Villkor</h4>
            <nav className="flex flex-col gap-3 text-sm text-ink-500">
              <Link href="/juridik/integritet" className="hover:text-petroleum-600 transition-colors">Integritet</Link>
              <Link href="/juridik/cookies" className="hover:text-petroleum-600 transition-colors">Cookies</Link>
              <Link href="/juridik/villkor" className="hover:text-petroleum-600 transition-colors">Användarvillkor</Link>
              <Link href="/juridik/gdpr" className="hover:text-petroleum-600 transition-colors">GDPR</Link>
            </nav>
          </div>
        </div>
      </div>
      <div className="mx-auto mt-16 max-w-7xl border-t border-sand-200 pt-8 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-ink-500">
        <p className="text-center sm:text-left">&copy; {new Date().getFullYear()} Revalta AB. Alla rättigheter reserverade.</p>
        <p className="font-medium">Svensk Proptech</p>
      </div>
    </footer>
  );
}
