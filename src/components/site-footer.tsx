import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-background px-8 py-20 text-ink-800">
      <div className="mx-auto flex max-w-7xl flex-col gap-12 md:flex-row md:items-start md:justify-between">
        <div className="max-w-xs">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-5 h-5 rounded-md bg-primary flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-background"></div>
            </div>
            <p className="text-xl font-bold tracking-tight text-ink-900">Revalta</p>
          </div>
          <p className="text-sm leading-relaxed text-ink-600 font-medium">
            Ett professionellt fastighetssystem byggt för moderna svenska fastighetsägare och förvaltare.
          </p>
        </div>
        
        <div className="grid grid-cols-2 gap-16 sm:grid-cols-3">
          <div>
            <h4 className="text-sm font-semibold text-ink-950 mb-6">Plattformen</h4>
            <nav className="flex flex-col gap-4 text-sm text-ink-500 font-medium">
              <Link href="/portal" className="hover:text-primary transition-colors">Boendeportal</Link>
              <Link href="/register" className="hover:text-primary transition-colors">Boka demo</Link>
              <Link href="/login" className="hover:text-primary transition-colors">Logga in</Link>
            </nav>
          </div>
          
          <div className="col-span-2 sm:col-span-1">
            <h4 className="text-sm font-semibold text-ink-950 mb-6">Juridik & Villkor</h4>
            <nav className="flex flex-col gap-4 text-sm text-ink-500 font-medium">
              <Link href="/juridik/integritet" className="hover:text-primary transition-colors">Integritet</Link>
              <Link href="/juridik/cookies" className="hover:text-primary transition-colors">Cookies</Link>
              <Link href="/juridik/villkor" className="hover:text-primary transition-colors">Användarvillkor</Link>
              <Link href="/juridik/gdpr" className="hover:text-primary transition-colors">GDPR</Link>
            </nav>
          </div>
        </div>
      </div>
      <div className="mx-auto mt-20 max-w-7xl border-t border-border pt-8 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-ink-400 font-medium">
        <p className="text-center sm:text-left">&copy; {new Date().getFullYear()} Revalta AB. Alla rättigheter reserverade.</p>
        <p>Svensk Premium Proptech</p>
      </div>
    </footer>
  );
}
