import { MarketingHeader } from "@/components/marketing-header";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <MarketingHeader />
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
