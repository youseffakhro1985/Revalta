import Link from 'next/link';
import { SiteFooter } from '@/components/site-footer';

export default function Home() {
  return (
    <>
      <main className="min-h-screen bg-[#FDFCFB] text-ink-900 font-sans selection:bg-petroleum-100 selection:text-petroleum-900">
        
        {/* Navbar */}
        <header className="sticky top-0 z-50 bg-[#FDFCFB]/80 backdrop-blur-md border-b border-sand-200/50">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
            <Link href="/" className="text-xl font-semibold tracking-tighter text-petroleum-700 flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-petroleum-600"></div>
              Revalta
            </Link>
            <nav className="hidden md:flex items-center gap-8">
              <Link href="#funktioner" className="text-sm font-medium text-ink-600 hover:text-petroleum-600 transition-colors">Funktioner i plattformen</Link>
              <Link href="/portal" className="text-sm font-medium text-ink-600 hover:text-petroleum-600 transition-colors">Boendeportal</Link>
            </nav>
            <div className="flex items-center gap-4">
               <Link href="/login" className="text-sm font-medium text-ink-600 hover:text-petroleum-600 transition-colors hidden sm:block">Logga in</Link>
               <Link href="/register" className="rounded-lg bg-petroleum-600 px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-petroleum-700 shadow-sm">
                 Boka demo
               </Link>
            </div>
          </div>
        </header>

        {/* Hero Section */}
        <section className="relative overflow-hidden pt-16 lg:pt-24 pb-32">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-sand-100/40 via-[#FDFCFB] to-[#FDFCFB] -z-10"></div>
          <div className="mx-auto max-w-7xl px-6 text-center">
            <div className="animate-fade-in-soft flex flex-col items-center">
              <span className="mb-6 inline-flex items-center rounded-full border border-sand-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-ink-500 shadow-sm">
                Svenskt Fastighetssystem
              </span>
              <h1 className="max-w-4xl text-5xl font-medium leading-[1.15] tracking-tight text-ink-950 sm:text-6xl lg:text-7xl">
                Fastighetssystemet för modern <span className="text-petroleum-700">svensk förvaltning</span>
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-600">
                Ett premiumverktyg som samlar allt – från felanmälan och fastighetsregister till boendeportal och teamets arbetsflöden. Byggt med skandinavisk precision.
              </p>
              <div className="mt-10 flex flex-col gap-3 sm:flex-row justify-center w-full sm:w-auto">
                <Link href="/register" className="inline-flex justify-center items-center rounded-xl bg-petroleum-600 px-8 py-3.5 text-sm font-semibold text-white shadow-premium-sm transition-all hover:bg-petroleum-700 hover:shadow-premium-md hover:-translate-y-0.5 duration-300">
                  Boka en visning
                </Link>
                <Link href="/portal" className="inline-flex justify-center items-center rounded-xl border border-sand-200 bg-white px-8 py-3.5 text-sm font-medium text-ink-800 shadow-sm transition-all hover:bg-sand-50 duration-300">
                  Utforska funktioner
                </Link>
              </div>
            </div>

            {/* Large Enterprise Hero Mockup */}
            <div className="mt-20 mx-auto max-w-6xl relative z-10 animate-slide-up-soft perspective-1000">
              <div className="rounded-[24px] border border-sand-200/80 bg-white shadow-2xl overflow-hidden flex transform transition-transform duration-700 hover:scale-[1.01]">
                
                {/* Sidebar */}
                <div className="hidden md:flex w-64 bg-sand-50/50 border-r border-sand-200/60 flex-col">
                  <div className="h-16 flex items-center px-6 border-b border-sand-200/60">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded bg-petroleum-600"></div>
                      <span className="font-semibold text-sm tracking-tight text-ink-900">Revalta</span>
                    </div>
                  </div>
                  <div className="p-4 flex-1 space-y-1">
                    <div className="px-3 py-2 bg-white rounded-lg border border-sand-200 shadow-sm flex items-center gap-3 text-sm font-medium text-petroleum-700">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                      Översikt
                    </div>
                    {[
                      { icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4", label: "Fastighetsregister" },
                      { icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01", label: "Ärendehantering" },
                      { icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6", label: "Boendeportal" },
                      { icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z", label: "Team och arbetsflöden" },
                      { icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z", label: "Dokument" },
                      { icon: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z", label: "Fakturering" },
                      { icon: "M13 10V3L4 14h7v7l9-11h-7z", label: "AI-insikter" },
                    ].map((item, i) => (
                      <div key={i} className="px-3 py-2 rounded-lg flex items-center gap-3 text-sm font-medium text-ink-600 hover:bg-sand-100/50 cursor-default">
                        <svg className="w-4 h-4 text-ink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} /></svg>
                        {item.label}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 bg-white flex flex-col text-left">
                  {/* Topbar */}
                  <div className="h-16 border-b border-sand-200/60 px-6 flex items-center justify-between bg-white">
                    <div className="flex items-center gap-2 text-sm text-ink-500">
                      <span>Revalta</span>
                      <span className="text-sand-300">/</span>
                      <span className="text-ink-900 font-medium">Portföljöversikt</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="relative hidden sm:block">
                        <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        <div className="w-48 lg:w-64 h-9 rounded-lg border border-sand-200 bg-sand-50/50"></div>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-sand-200 border border-sand-300"></div>
                    </div>
                  </div>

                  {/* Dashboard Content */}
                  <div className="p-5 sm:p-8 bg-[#FDFCFB] flex-1">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-6 gap-4">
                      <div>
                        <h2 className="text-2xl font-semibold text-ink-950">God morgon, Anders</h2>
                        <p className="text-sm text-ink-500 mt-1">Här är en sammanfattning av fastighetsbeståndet idag.</p>
                      </div>
                      <div className="px-4 py-2 bg-petroleum-600 text-white text-sm font-medium rounded-lg shadow-sm">
                        Skapa ärende
                      </div>
                    </div>

                    {/* KPI Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                      {[
                        { label: "Aktiva Ärenden", val: "24", trend: "↓ 2", status: "success" },
                        { label: "Vakansgrad", val: "1.2%", trend: "0.0%", status: "neutral" },
                        { label: "Avklarade (Mån)", val: "142", trend: "↑ 12%", status: "success" },
                        { label: "OVK Åtgärder", val: "3", trend: "Kritisk", status: "danger" },
                      ].map((kpi, i) => (
                        <div key={i} className="bg-white p-4 sm:p-5 rounded-xl border border-sand-200/80 shadow-sm flex flex-col">
                          <p className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-2">{kpi.label}</p>
                          <div className="flex flex-col sm:flex-row sm:items-end justify-between mt-auto gap-2">
                            <p className="text-xl sm:text-2xl font-semibold text-ink-950 leading-none">{kpi.val}</p>
                            <span className={`self-start sm:self-auto text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                              kpi.status === 'success' ? 'bg-success-50 text-success-700' :
                              kpi.status === 'danger' ? 'bg-danger-50 text-danger-700' :
                              'bg-sand-100 text-ink-600'
                            }`}>
                              {kpi.trend}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Two column layout */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      {/* Table Area */}
                      <div className="lg:col-span-2 bg-white rounded-xl border border-sand-200/80 shadow-sm overflow-hidden flex flex-col">
                        <div className="px-5 py-4 border-b border-sand-200/80 flex justify-between items-center">
                          <h3 className="text-sm font-semibold text-ink-900">Prioriterade arbetsordrar</h3>
                          <span className="text-xs font-medium text-petroleum-600 cursor-pointer">Visa alla</span>
                        </div>
                        <div className="divide-y divide-sand-100 flex-1">
                          {[
                            { id: "ÄR-4091", title: "Vattenläcka tvättstuga", prop: "Kungsbrinken 4", time: "10 min sedan", stat: "Akut", color: "bg-danger-50 text-danger-700 border-danger-200" },
                            { id: "ÄR-4090", title: "Hiss ur funktion, port B", prop: "Sveavägen 112", time: "1 tim sedan", stat: "Pågår", color: "bg-warning-50 text-warning-700 border-warning-200" },
                            { id: "ÄR-4089", title: "Byte av belysning gård", prop: "Linnégatan 44", time: "Igår", stat: "Tilldelad", color: "bg-sand-100 text-ink-700 border-sand-200" },
                          ].map((row, i) => (
                            <div key={i} className="px-5 py-3.5 flex items-center justify-between hover:bg-sand-50/50 transition-colors">
                              <div className="flex items-center gap-4">
                                <span className="hidden sm:block text-xs font-medium text-ink-400 w-16">{row.id}</span>
                                <div>
                                  <p className="text-sm font-medium text-ink-950">{row.title}</p>
                                  <p className="text-xs text-ink-500 mt-0.5">{row.prop} • {row.time}</p>
                                </div>
                              </div>
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${row.color}`}>{row.stat}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      {/* Side Widget */}
                      <div className="bg-white rounded-xl border border-sand-200/80 shadow-sm p-5 flex flex-col">
                         <h3 className="text-sm font-semibold text-ink-900 mb-4">Fastighetsbestånd</h3>
                         <div className="flex-1 flex flex-col justify-center gap-5">
                            <div className="flex items-start gap-3">
                              <div className="w-2 h-2 rounded-full bg-petroleum-600 mt-1.5"></div>
                              <div className="flex-1">
                                <div className="flex justify-between text-xs mb-1.5">
                                  <span className="text-ink-700 font-medium">Bostäder</span>
                                  <span className="text-ink-900 font-semibold">12 400 kvm</span>
                                </div>
                                <div className="h-1.5 w-full bg-sand-100 rounded-full"><div className="h-1.5 w-[75%] bg-petroleum-600 rounded-full"></div></div>
                              </div>
                            </div>
                            <div className="flex items-start gap-3">
                              <div className="w-2 h-2 rounded-full bg-sand-400 mt-1.5"></div>
                              <div className="flex-1">
                                <div className="flex justify-between text-xs mb-1.5">
                                  <span className="text-ink-700 font-medium">Lokaler</span>
                                  <span className="text-ink-900 font-semibold">3 200 kvm</span>
                                </div>
                                <div className="h-1.5 w-full bg-sand-100 rounded-full"><div className="h-1.5 w-[20%] bg-sand-400 rounded-full"></div></div>
                              </div>
                            </div>
                         </div>
                      </div>
                    </div>

                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="funktioner" className="border-t border-sand-200/60 bg-white py-24 lg:py-32">
          <div className="mx-auto max-w-7xl px-6">
            <div className="text-center max-w-3xl mx-auto mb-20">
              <h2 className="text-sm font-semibold uppercase tracking-widest text-petroleum-600 mb-3">Moduler</h2>
              <h3 className="text-3xl font-medium text-ink-950 sm:text-4xl">Allt du behöver på ett ställe</h3>
              <p className="mt-4 text-ink-600 text-lg">Ett komplett och sammanlänkat ekosystem för att effektivisera din förvaltning, från inkommande felanmälan till dokumentation och team-koordinering.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              
              {/* Feature 1: Fastighetsöversikt */}
              <div className="group rounded-[20px] border border-sand-200/80 bg-[#FDFCFB] p-8 hover:shadow-premium-md transition-all duration-300 flex flex-col">
                <div className="mb-6 h-40 bg-sand-100/50 rounded-xl border border-sand-200/60 p-4 flex items-center justify-center">
                   {/* Mini Mockup */}
                   <div className="bg-white rounded-lg border border-sand-200 shadow-sm p-4 w-full">
                     <div className="flex items-center justify-between mb-3">
                       <span className="text-[10px] uppercase font-semibold text-ink-500">Fastighet</span>
                       <span className="w-1.5 h-1.5 rounded-full bg-success-500"></span>
                     </div>
                     <p className="text-sm font-semibold text-ink-900">Kvarteret Tjädern 4</p>
                     <p className="text-[11px] text-ink-500 mb-4">Stockholm, 24 lgh • 4 lokaler</p>
                     <div className="flex gap-3">
                       <div className="flex-1 bg-sand-50 rounded p-2.5 border border-sand-100">
                         <div className="text-[9px] text-ink-500 mb-0.5">Uthyrningsgrad</div>
                         <div className="text-xs font-semibold text-ink-900">98%</div>
                       </div>
                       <div className="flex-1 bg-sand-50 rounded p-2.5 border border-sand-100">
                         <div className="text-[9px] text-ink-500 mb-0.5">Energiklass</div>
                         <div className="text-xs font-semibold text-ink-900">B</div>
                       </div>
                     </div>
                   </div>
                </div>
                <h4 className="text-xl font-semibold text-ink-950 mb-2">Fastighetsöversikt</h4>
                <p className="text-ink-600 text-sm leading-relaxed flex-1">Full kontroll över ditt bestånd. Hantera ytor, teknisk dokumentation, energidata och hyresgäster på en strukturerad plats.</p>
              </div>

              {/* Feature 2: Ärendehantering */}
              <div className="group rounded-[20px] border border-sand-200/80 bg-[#FDFCFB] p-8 hover:shadow-premium-md transition-all duration-300 flex flex-col">
                <div className="mb-6 h-40 bg-sand-100/50 rounded-xl border border-sand-200/60 p-4 flex flex-col justify-center gap-3">
                   {/* Mini Mockup */}
                   <div className="bg-white rounded-lg border-l-2 border-l-danger-500 border-t border-r border-b border-sand-200 shadow-sm p-3 flex items-start gap-3">
                     <div className="flex-1">
                       <div className="flex justify-between items-center mb-1">
                         <p className="text-xs font-semibold text-ink-900">Fuktfläck i taket</p>
                         <span className="text-[9px] px-1.5 py-0.5 bg-danger-50 text-danger-700 rounded font-medium">Akut</span>
                       </div>
                       <p className="text-[10px] text-ink-500">ÄR-4012 • Skapad av hyresgäst i lgh 1204.</p>
                     </div>
                   </div>
                   <div className="bg-white rounded-lg border-l-2 border-l-warning-500 border-t border-r border-b border-sand-200 shadow-sm p-3 flex items-start gap-3 opacity-80">
                     <div className="flex-1">
                       <div className="flex justify-between items-center mb-1">
                         <p className="text-xs font-semibold text-ink-900">Kallt i lägenheten</p>
                         <span className="text-[9px] px-1.5 py-0.5 bg-warning-50 text-warning-700 rounded font-medium">Prio 2</span>
                       </div>
                       <p className="text-[10px] text-ink-500">ÄR-4011 • Elementen är ljumna.</p>
                     </div>
                   </div>
                </div>
                <h4 className="text-xl font-semibold text-ink-950 mb-2">Ärendehantering</h4>
                <p className="text-ink-600 text-sm leading-relaxed flex-1">Smart flöde för felanmälningar. Ta emot, prioritera och skapa arbetsordrar. Följ status från ax till limpa i en snygg listvy.</p>
              </div>

              {/* Feature 3: Boendeportal */}
              <div className="group rounded-[20px] border border-sand-200/80 bg-[#FDFCFB] p-8 hover:shadow-premium-md transition-all duration-300 flex flex-col">
                <div className="mb-6 h-40 bg-sand-100/50 rounded-xl border border-sand-200/60 p-4 overflow-hidden relative flex justify-center items-end">
                   {/* Mobile Mockup */}
                   <div className="w-36 bg-white rounded-t-2xl border-t-[5px] border-x-[5px] border-ink-900 shadow-md h-[120px] flex flex-col relative pt-2">
                     <div className="w-10 h-1 bg-ink-200 rounded-full mx-auto mb-3"></div>
                     <div className="px-4 pb-2 border-b border-sand-100">
                       <p className="text-[11px] font-semibold text-center text-ink-900">Min Bostad</p>
                     </div>
                     <div className="p-3 flex-1 space-y-2 bg-sand-50/50">
                       <div className="bg-white rounded-lg p-2.5 border border-sand-200 shadow-sm">
                         <p className="text-[9px] font-semibold text-ink-900 mb-1">Nytt meddelande</p>
                         <p className="text-[8px] text-ink-500 leading-relaxed">Vattnet stängs av onsdag kl 10-12 pga underhåll.</p>
                       </div>
                     </div>
                   </div>
                </div>
                <h4 className="text-xl font-semibold text-ink-950 mb-2">Boendeportal</h4>
                <p className="text-ink-600 text-sm leading-relaxed flex-1">Transparent app för hyresgäster. Skapa ärenden, läs driftinfo, hitta bopärm och betala hyran direkt via mobilen.</p>
              </div>

              {/* Feature 4: Team & Arbetsflöden */}
              <div className="group rounded-[20px] border border-sand-200/80 bg-[#FDFCFB] p-8 hover:shadow-premium-md transition-all duration-300 flex flex-col">
                <div className="mb-6 h-40 bg-sand-100/50 rounded-xl border border-sand-200/60 p-4 flex items-center justify-center">
                   <div className="bg-white rounded-lg border border-sand-200 shadow-sm p-4 w-full">
                     <p className="text-[10px] font-semibold uppercase text-ink-500 mb-3">Tilldelad resurs</p>
                     <div className="flex items-center gap-3 mb-4">
                       <div className="w-10 h-10 rounded-full bg-sand-200 border-2 border-white shadow-sm flex items-center justify-center text-xs font-semibold text-ink-500">EJ</div>
                       <div>
                         <p className="text-sm font-semibold text-ink-900">Erik Johansson</p>
                         <p className="text-[10px] text-ink-500">Fastighetstekniker</p>
                       </div>
                     </div>
                     <div className="flex gap-2">
                       <span className="text-[10px] px-2 py-1 bg-sand-100 text-ink-700 rounded-md font-medium">VVS</span>
                       <span className="text-[10px] px-2 py-1 bg-sand-100 text-ink-700 rounded-md font-medium">Inre skötsel</span>
                     </div>
                   </div>
                </div>
                <h4 className="text-xl font-semibold text-ink-950 mb-2">Team och arbetsflöden</h4>
                <p className="text-ink-600 text-sm leading-relaxed flex-1">Tilldela rätt uppgift till rätt person. Följ upp tid, material och åtgärder per tekniker eller leverantör.</p>
              </div>

              {/* Feature 5: Dokument */}
              <div className="group rounded-[20px] border border-sand-200/80 bg-[#FDFCFB] p-8 hover:shadow-premium-md transition-all duration-300 flex flex-col">
                <div className="mb-6 h-40 bg-sand-100/50 rounded-xl border border-sand-200/60 p-4 flex flex-col justify-center gap-2.5">
                   {[
                     { name: "OVK-Protokoll_2024.pdf", type: "PDF", size: "2.4 MB" },
                     { name: "Ritning_Källare_A.dwg", type: "DWG", size: "14.1 MB" },
                     { name: "Serviceavtal_Hiss.doc", type: "DOC", size: "124 KB" },
                   ].map((doc, i) => (
                     <div key={i} className={`bg-white rounded-lg border border-sand-200 shadow-sm px-3 py-2.5 flex items-center justify-between ${i === 2 ? 'opacity-70' : ''}`}>
                       <div className="flex items-center gap-3">
                         <div className="w-7 h-7 rounded bg-sand-100 flex items-center justify-center text-[9px] font-bold text-ink-500">{doc.type}</div>
                         <div>
                           <p className="text-xs font-medium text-ink-900 truncate w-32">{doc.name}</p>
                           <p className="text-[9px] text-ink-400 mt-0.5">{doc.size}</p>
                         </div>
                       </div>
                       <svg className="w-3.5 h-3.5 text-ink-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                     </div>
                   ))}
                </div>
                <h4 className="text-xl font-semibold text-ink-950 mb-2">Dokumentarkiv</h4>
                <p className="text-ink-600 text-sm leading-relaxed flex-1">Ordning och reda på ritningar, avtal, OVK-protokoll och besiktningar kopplade direkt till rätt fastighet eller komponent.</p>
              </div>

              {/* Feature 6: AI-insikter & Fakturering */}
              <div className="group rounded-[20px] border border-sand-200/80 bg-[#FDFCFB] p-8 hover:shadow-premium-md transition-all duration-300 flex flex-col">
                <div className="mb-6 h-40 bg-sand-100/50 rounded-xl border border-sand-200/60 p-4 flex items-center justify-center">
                   <div className="bg-white rounded-lg border border-sand-200 shadow-sm p-4 w-full">
                     <div className="flex items-center justify-between mb-3">
                       <div className="px-2 py-1 bg-petroleum-50 text-petroleum-700 text-[10px] font-semibold rounded border border-petroleum-100 flex items-center gap-1.5">
                         <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                         AI-insikt
                       </div>
                       <span className="text-[10px] text-ink-400">Idag 08:14</span>
                     </div>
                      <p className="text-xs text-ink-800 leading-relaxed italic mb-4">
                       &ldquo;30% högre frekvens av värmerelaterade felanmälningar i hus B. Underlag för debitering av extern VVS-firma är redo.&rdquo;
                     </p>
                     <div className="flex gap-2">
                       <div className="flex-1 h-1.5 bg-petroleum-600 rounded-full"></div>
                       <div className="flex-1 h-1.5 bg-petroleum-300 rounded-full"></div>
                       <div className="flex-1 h-1.5 bg-sand-200 rounded-full"></div>
                     </div>
                   </div>
                </div>
                <h4 className="text-xl font-semibold text-ink-950 mb-2">AI-insikter & Fakturering</h4>
                <p className="text-ink-600 text-sm leading-relaxed flex-1">Låt systemet hitta avvikelser, summera komplexa ärenden och förenkla underlaget för smidig fakturering.</p>
              </div>

            </div>
          </div>
        </section>

      </main>
      <SiteFooter />
    </>
  );
}
