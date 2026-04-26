import Link from "next/link";
import { Button } from "@/components/ui/button";

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-xl font-semibold tracking-tight">
          Revalta
        </Link>

        <nav className="hidden items-center gap-8 text-sm text-gray-600 md:flex">
          <Link href="/funktioner" className="text-gray-600 hover:text-gray-900 transition-colors">Funktioner</Link>
          <Link href="/priser" className="text-gray-600 hover:text-gray-900 transition-colors">Priser</Link>
          <Link href="/om-oss" className="text-gray-600 hover:text-gray-900 transition-colors">Om oss</Link>
          <Link href="/kontakt" className="text-gray-600 hover:text-gray-900 transition-colors">Kontakt</Link>
        </nav>

        <div className="flex items-center gap-3">
          <Button href="/login" variant="ghost">Logga in</Button>
          <Button href="/register">Kom igång</Button>
        </div>
      </div>
    </header>
  );
}
