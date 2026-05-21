import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xl font-extrabold tracking-tight">Revalta</p>
          <p className="mt-2 text-sm text-slate-400">Modern SaaS för fastighetsservice och felanmälan.</p>
        </div>
        <nav className="flex flex-wrap gap-4 text-sm text-slate-300">
          <Link href="/portal" className="hover:text-white">Boendeportal</Link>
          <Link href="/juridik/integritet" className="hover:text-white">Integritet</Link>
          <Link href="/juridik/cookies" className="hover:text-white">Cookies</Link>
          <Link href="/juridik/villkor" className="hover:text-white">Villkor</Link>
          <Link href="/juridik/gdpr" className="hover:text-white">GDPR</Link>
        </nav>
      </div>
    </footer>
  );
}
