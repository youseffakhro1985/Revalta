import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, BarChart3, ShieldCheck, ArrowRight, Search, Bell } from "lucide-react";

export default function HomePage() {
  return (
    <main className="relative overflow-hidden bg-[#FAFAFA]">
      {/* Premium Background Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]"></div>

      <section className="relative mx-auto max-w-7xl px-6 pt-32 pb-24 sm:pt-40 sm:pb-32 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <Badge variant="secondary" className="mb-8 pl-1 pr-3 py-1 shadow-sm border border-gray-200/50 bg-white/50 backdrop-blur-md">
            <span className="bg-primary text-white text-[10px] px-2 py-0.5 rounded-full mr-2 font-bold tracking-wider">NYHET</span>
            <span className="text-gray-600 font-medium">Revalta AI 2.0 är nu live</span>
          </Badge>

          <h1 className="text-5xl font-extrabold tracking-tight text-gray-950 sm:text-7xl lg:text-[5rem] xl:text-[5.5rem] leading-[1.1]">
            Fastighetsförvaltning <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-gray-900 via-gray-600 to-gray-500">
              på autopilot.
            </span>
          </h1>

          <p className="mx-auto mt-8 max-w-2xl text-lg sm:text-xl leading-8 text-gray-600 font-medium">
            Den första plattformen som kombinerar AI, ärendehantering och tenant isolation 
            i ett och samma gränssnitt. Byggt för Enterprise, designat för dig.
          </p>

          <div className="mt-10 flex items-center justify-center gap-4">
            <Button href="/register" className="h-12 px-8 text-base">
              Starta kostnadsfritt <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
            <Button href="/demo" variant="secondary" className="h-12 px-8 text-base bg-white/50 backdrop-blur-md">
              Boka demo
            </Button>
          </div>
          <p className="mt-4 text-xs text-gray-500 font-medium">Inga kreditkort krävs • Uppsättning på 2 minuter</p>
        </div>

        {/* Mock Dashboard UI Showcase */}
        <div className="mx-auto mt-20 max-w-5xl">
          <div className="rounded-2xl border border-gray-200/60 bg-white/40 backdrop-blur-2xl shadow-2xl p-2 ring-1 ring-gray-900/5 transform perspective-1000 rotateX-2 scale-100 transition-transform duration-700 hover:scale-[1.01]">
            <div className="rounded-xl border border-gray-200/50 bg-white overflow-hidden shadow-sm flex flex-col h-[500px]">
              {/* Fake Topbar */}
              <div className="h-12 border-b border-gray-100 flex items-center justify-between px-4 bg-gray-50/50">
                <div className="flex space-x-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400"></div>
                  <div className="w-3 h-3 rounded-full bg-amber-400"></div>
                  <div className="w-3 h-3 rounded-full bg-emerald-400"></div>
                </div>
                <div className="flex items-center gap-4 text-gray-400">
                  <Search className="w-4 h-4" />
                  <Bell className="w-4 h-4" />
                  <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-gray-200 to-gray-300 border border-gray-300"></div>
                </div>
              </div>
              
              {/* Fake Content Area */}
              <div className="flex flex-1 overflow-hidden">
                {/* Fake Sidebar */}
                <div className="w-48 border-r border-gray-100 bg-gray-50/30 p-4 hidden sm:block">
                  <div className="w-24 h-4 bg-gray-200 rounded-md mb-8"></div>
                  <div className="space-y-3">
                    <div className="w-full h-8 bg-gray-100 rounded-md"></div>
                    <div className="w-3/4 h-8 bg-transparent rounded-md"></div>
                    <div className="w-5/6 h-8 bg-transparent rounded-md"></div>
                  </div>
                </div>
                {/* Fake Main Content */}
                <div className="flex-1 p-6 bg-gray-50/10">
                  <div className="flex items-center justify-between mb-8">
                    <div className="w-48 h-6 bg-gray-200 rounded-md"></div>
                    <div className="w-24 h-8 bg-primary/90 rounded-lg"></div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 mb-8">
                    <div className="h-24 rounded-xl border border-gray-100 bg-white shadow-sm p-4">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 mb-3"></div>
                      <div className="w-16 h-4 bg-gray-200 rounded"></div>
                    </div>
                    <div className="h-24 rounded-xl border border-gray-100 bg-white shadow-sm p-4">
                      <div className="w-8 h-8 rounded-full bg-amber-100 mb-3"></div>
                      <div className="w-16 h-4 bg-gray-200 rounded"></div>
                    </div>
                    <div className="h-24 rounded-xl border border-gray-100 bg-white shadow-sm p-4">
                      <div className="w-8 h-8 rounded-full bg-blue-100 mb-3"></div>
                      <div className="w-16 h-4 bg-gray-200 rounded"></div>
                    </div>
                  </div>
                  <div className="h-48 rounded-xl border border-gray-100 bg-white shadow-sm p-4 flex flex-col gap-3">
                    <div className="w-full h-10 bg-gray-50 rounded-lg border border-gray-100"></div>
                    <div className="w-full h-10 bg-gray-50 rounded-lg border border-gray-100"></div>
                    <div className="w-full h-10 bg-gray-50 rounded-lg border border-gray-100"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Premium Features Grid */}
      <section className="relative border-t border-gray-200/50 bg-white py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl lg:text-center mb-16">
            <h2 className="text-base font-semibold leading-7 text-primary">Utan kompromisser</h2>
            <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">Allt du behöver. Inget du inte behöver.</p>
          </div>
          <div className="mx-auto max-w-2xl lg:max-w-none">
            <div className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-10 lg:max-w-none lg:grid-cols-3">
              <div className="flex flex-col gap-4 p-8 rounded-3xl bg-gray-50/50 border border-gray-100 hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
                <div className="w-12 h-12 flex items-center justify-center rounded-2xl bg-white shadow-sm border border-gray-100">
                  <Sparkles className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">AI Felanmälan</h3>
                <p className="text-gray-600 text-sm leading-relaxed">
                  Låt AI analysera inkommande ärenden i realtid. Identifera prioritet, risk och kategori innan du ens öppnat mailet.
                </p>
              </div>
              <div className="flex flex-col gap-4 p-8 rounded-3xl bg-gray-50/50 border border-gray-100 hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
                <div className="w-12 h-12 flex items-center justify-center rounded-2xl bg-white shadow-sm border border-gray-100">
                  <ShieldCheck className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Enterprise Säkerhet</h3>
                <p className="text-gray-600 text-sm leading-relaxed">
                  Byggt på en robust RBAC-modell med strict tenant isolation, httpOnly JWTs och fullständiga audit logs.
                </p>
              </div>
              <div className="flex flex-col gap-4 p-8 rounded-3xl bg-gray-50/50 border border-gray-100 hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
                <div className="w-12 h-12 flex items-center justify-center rounded-2xl bg-white shadow-sm border border-gray-100">
                  <BarChart3 className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Full Kontroll</h3>
                <p className="text-gray-600 text-sm leading-relaxed">
                  Följ upp SLAs, hantera arbetsordrar och bjud in obegränsat antal kollegor med vårt snygga Dashboard-gränssnitt.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
