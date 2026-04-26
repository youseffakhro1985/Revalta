import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowRight, Building2, Wrench, ShieldCheck } from "lucide-react";

export default function MarketingPage() {
  return (
    <div className="flex flex-col items-center justify-center">
      {/* Hero Section */}
      <section className="w-full py-24 md:py-32 lg:py-40 bg-gradient-to-b from-background to-secondary/20">
        <div className="container px-4 md:px-6 mx-auto text-center">
          <div className="max-w-3xl mx-auto space-y-8">
            <h1 className="text-5xl font-extrabold tracking-tight sm:text-6xl md:text-7xl">
              Framtidens <span className="text-primary">Fastighetsförvaltning</span>
            </h1>
            <p className="mx-auto max-w-[700px] text-lg text-muted-foreground md:text-xl">
              En komplett SaaS-plattform för fastighetsägare, förvaltare och hyresgäster. Hantera felanmälningar med AI och spara tid.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button href="/register" className="gap-2 px-8 py-3 text-base">
                Prova gratis <ArrowRight className="h-4 w-4" />
              </Button>
              <Button href="/boka-demo" variant="secondary" className="px-8 py-3 text-base">
                Boka demo
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="w-full py-20 lg:py-32 bg-background">
        <div className="container px-4 md:px-6 mx-auto">
          <div className="grid gap-12 lg:grid-cols-3">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="p-4 bg-primary/10 rounded-full text-primary">
                <Building2 className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-bold">Smart Översikt</h3>
              <p className="text-muted-foreground">Få full kontroll över alla dina fastigheter och avtal på ett och samma ställe.</p>
            </div>
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="p-4 bg-primary/10 rounded-full text-primary">
                <Wrench className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-bold">AI Felanmälan</h3>
              <p className="text-muted-foreground">Låt vår AI kategorisera och prioritera inkommande ärenden automatiskt.</p>
            </div>
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="p-4 bg-primary/10 rounded-full text-primary">
                <ShieldCheck className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-bold">Säkert & Isolerat</h3>
              <p className="text-muted-foreground">All data är strikt separerad per företag med högsta säkerhetsstandard.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
