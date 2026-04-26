import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 max-w-screen-xl mx-auto items-center justify-between px-4">
          <Link href="/" className="flex items-center space-x-2">
            <span className="font-extrabold tracking-tight text-xl text-primary">Revalta</span>
          </Link>
          <nav className="flex items-center space-x-4">
            <Link href="/funktioner" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              Funktioner
            </Link>
            <Link href="/priser" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              Priser
            </Link>
          </nav>
          <div className="flex items-center space-x-4">
            <Link href="/login">
              <Button variant="ghost">Logga in</Button>
            </Link>
            <Link href="/register">
              <Button>Kom igång</Button>
            </Link>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t py-12 md:py-16">
        <div className="container max-w-screen-xl mx-auto flex flex-col items-center justify-center gap-4 text-center px-4">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Revalta AB. Alla rättigheter förbehållna.
          </p>
        </div>
      </footer>
    </div>
  );
}
