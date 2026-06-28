import Link from "next/link";
import { Button } from "@/components/ui/button";

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-sand-200/70 bg-[#FDFCFB]/95">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2 text-xl font-semibold tracking-tight text-petroleum-700">
          <span className="h-5 w-5 rounded bg-petroleum-600" />
          Revalta
        </Link>

        <nav className="hidden items-center gap-8 text-sm text-ink-600 md:flex">
          <Link href="/#funktioner" className="transition-colors hover:text-petroleum-700">Funktioner</Link>
          <Link href="/portal" className="transition-colors hover:text-petroleum-700">Boendeportal</Link>
          <Link href="/juridik/integritet" className="transition-colors hover:text-petroleum-700">Juridik</Link>
        </nav>

        <div className="flex items-center gap-3">
          <Button href="/login" variant="ghost">Logga in</Button>
          <Button href="/register">Kom igång</Button>
        </div>
      </div>
    </header>
  );
}
