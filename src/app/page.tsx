import Link from 'next/link';
import { SiteFooter } from '@/components/site-footer';

export default function Home() {
  return (
    <>
      <main className="min-h-screen bg-background text-ink-900 selection:bg-accent selection:text-ink-950">
        
        {/* Navbar */}
        <header className="sticky top-0 z-50 bg-background/90 backdrop-blur-md border-b border-border">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-6">
            <Link href="/" className="text-xl font-bold tracking-tight text-ink-900 flex items-center gap-3">
              <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
                 <div className="w-2 h-2 rounded-full bg-background"></div>
              </div>
              Revalta
            </Link>
            <nav className="hidden md:flex items-center gap-10">
              <Link href="#funktioner" className="text-sm font-medium text-ink-600 hover:text-primary transition-colors">Funktioner</Link>
              <Link href="/portal" className="text-sm font-medium text-ink-600 hover:text-primary transition-colors">Boendeportal</Link>
            </nav>
            <div className="flex items-center gap-6">
               <Link href="/login" className="text-sm font-medium text-ink-600 hover:text-primary transition-colors hidden sm:block">Logga in</Link>
               <Link href="/register" className="rounded-xl bg-primary px-6 py-3 text-sm font-medium text-white transition-all hover:bg-primary-hover shadow-sm">
                 Boka demo
               </Link>
            </div>
          </div>
        </header>

        {/* Hero Section */}
        <section className="relative overflow-hidden pt-24 lg:pt-32 pb-32 lg:pb-40">
          <div className="mx-auto max-w-7xl px-8 text-center">
            <div className="flex flex-col items-center">
              <h1 className="max-w-4xl text-6xl font-semibold leading-[1.1] tracking-tight text-ink-950 sm:text-7xl lg:text-[84px]">
                Ett fastighetssystem <br/><span className="text-secondary">för moderna bolag.</span>
              </h1>
              <p className="mt-8 max-w-2xl text-xl leading-relaxed text-ink-600 font-medium">
                Revalta samlar felanmälan, fastighetsregister och boendeportal i ett svenskt, premiumverktyg byggt för att skapa förtroende och spara tid.
              </p>
              <div className="mt-12 flex flex-col gap-4 sm:flex-row justify-center w-full sm:w-auto">
                <Link href="/register" className="inline-flex justify-center items-center rounded-2xl bg-primary px-10 py-4 text-base font-medium text-white shadow-premium-sm transition-all hover:bg-primary-hover duration-200">
                  Kom igång
                </Link>
                <Link href="/portal" className="inline-flex justify-center items-center rounded-2xl border border-border bg-white px-10 py-4 text-base font-medium text-ink-800 shadow-sm transition-all hover:bg-ink-50 duration-200">
                  Utforska funktioner
                </Link>
              </div>
            </div>

            {/* Large Enterprise Hero Mockup */}
            <div className="mt-28 mx-auto max-w-6xl relative z-10">
              <div className="rounded-[24px] border border-border bg-white shadow-premium-lg overflow-hidden flex">
                
                {/* Sidebar */}
                <div className="hidden md:flex w-64 bg-[#FAFAFA] border-r border-border flex-col">
                  <div className="h-16 flex items-center px-6 border-b border-border">
                    <span className="font-semibold text-sm tracking-tight text-ink-900">Revalta</span>
                  </div>
                  <div className="p-5 flex-1 space-y-2">
                    <div className="px-3 py-2 bg-white rounded-xl border border-border shadow-sm flex items-center gap-3 text-sm font-medium text-primary">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                      Översikt
                    </div>
                    {[
                      { icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4", label: "Fastigheter" },
                      { icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2", label: "Ärendehantering" },
                      { icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z", label: "Team" },
                      { icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z", label: "Dokument" },
                    ].map((item, i) => (
                      <div key={i} className="px-3 py-2 rounded-xl flex items-center gap-3 text-sm font-medium text-ink-500 hover:text-ink-900 transition-colors cursor-default">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} /></svg>
                        {item.label}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 bg-white flex flex-col text-left">
                  {/* Topbar */}
                  <div className="h-16 border-b border-border px-8 flex items-center justify-between bg-white">
                    <div className="flex items-center gap-3 text-sm text-ink-500">
                      <span className="text-ink-900 font-medium">Översikt</span>
                    </div>
                    <div className="flex items-center gap-5">
                      <div className="relative hidden sm:block">
                        <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        <div className="w-48 lg:w-64 h-9 rounded-xl border border-border bg-[#FAFAFA]"></div>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-accent border border-border"></div>
                    </div>
                  </div>

                  {/* Dashboard Content */}
                  <div className="p-8 sm:p-10 bg-white flex-1">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-10 gap-4">
                      <div>
                        <h2 className="text-2xl font-semibold text-ink-950 tracking-tight">God morgon, Anders</h2>
                        <p className="text-base text-ink-500 mt-2">Din fastighetsportfölj mår bra idag.</p>
                      </div>
                      <div className="px-5 py-2.5 bg-primary hover:bg-primary-hover transition-colors text-white text-sm font-medium rounded-xl shadow-sm">
                        Nytt ärende
                      </div>
                    </div>

                    {/* KPI Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-10">
                      {[
                        { label: "Aktiva Ärenden", val: "14", trend: "Normal" },
                        { label: "Vakansgrad", val: "1.2%", trend: "Låg" },
                        { label: "OVK Åtgärder", val: "0", trend: "Klar" },
                        { label: "Fakturering", val: "4", trend: "Utkast" },
                      ].map((kpi, i) => (
                        <div key={i} className="bg-white p-6 rounded-2xl border border-border shadow-card flex flex-col">
                          <p className="text-xs font-medium text-ink-500 mb-3">{kpi.label}</p>
                          <div className="flex flex-col sm:flex-row sm:items-end justify-between mt-auto gap-2">
                            <p className="text-3xl font-semibold text-ink-950 tracking-tight">{kpi.val}</p>
                            <span className="text-xs font-medium text-ink-400">{kpi.trend}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Table Area */}
                    <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden flex flex-col">
                      <div className="px-6 py-5 border-b border-border flex justify-between items-center bg-[#FAFAFA]">
                        <h3 className="text-sm font-semibold text-ink-900">Senaste felanmälningar</h3>
                      </div>
                      <div className="divide-y divide-border flex-1">
                        {[
                          { id: "ÄR-4091", title: "Vattenläcka i källare", prop: "Kungsbrinken 4", stat: "Ny" },
                          { id: "ÄR-4090", title: "Hiss ur funktion", prop: "Sveavägen 112", stat: "Pågår" },
                          { id: "ÄR-4089", title: "Byte av belysning gård", prop: "Linnégatan 44", stat: "Klar" },
                        ].map((row, i) => (
                          <div key={i} className="px-6 py-4 flex items-center justify-between hover:bg-[#FAFAFA] transition-colors cursor-default">
                            <div className="flex items-center gap-6">
                              <span className="hidden sm:block text-sm font-medium text-ink-400 w-16">{row.id}</span>
                              <div>
                                <p className="text-sm font-medium text-ink-950">{row.title}</p>
                                <p className="text-xs font-medium text-ink-500 mt-1">{row.prop}</p>
                              </div>
                            </div>
                            <span className="text-xs font-medium text-ink-500">{row.stat}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="funktioner" className="border-t border-border bg-white py-32 lg:py-40">
          <div className="mx-auto max-w-7xl px-8">
            <div className="text-center max-w-3xl mx-auto mb-24">
              <h2 className="text-4xl font-semibold text-ink-950 tracking-tight">Hela systemet. Helt enkelt.</h2>
              <p className="mt-6 text-ink-600 text-xl font-medium leading-relaxed">Byggt för svensk fastighetsförvaltning med fokus på användarvänlighet och extrem tydlighet.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
              
              {/* Feature 1 */}
              <div className="flex flex-col">
                <div className="mb-8 h-56 bg-[#FAFAFA] rounded-3xl border border-border p-6 flex flex-col justify-center gap-4">
                   <div className="bg-white rounded-2xl border border-border shadow-card p-5 w-full">
                     <p className="text-sm font-semibold text-ink-900 mb-1">Kvarteret Tjädern 4</p>
                     <p className="text-xs text-ink-500 mb-5">24 lgh • 4 lokaler</p>
                     <div className="flex gap-4">
                       <div className="flex-1">
                         <div className="text-[10px] text-ink-500 mb-1">Uthyrning</div>
                         <div className="text-sm font-medium text-ink-900">98%</div>
                       </div>
                       <div className="flex-1">
                         <div className="text-[10px] text-ink-500 mb-1">Energiklass</div>
                         <div className="text-sm font-medium text-ink-900">B</div>
                       </div>
                     </div>
                   </div>
                </div>
                <h4 className="text-2xl font-semibold text-ink-950 mb-3 tracking-tight">Fastighetsregister</h4>
                <p className="text-ink-600 text-base leading-relaxed flex-1 font-medium">Hantera ytor, teknisk dokumentation, energidata och hyresgäster på en exklusiv och strukturerad plats.</p>
              </div>

              {/* Feature 2 */}
              <div className="flex flex-col">
                <div className="mb-8 h-56 bg-[#FAFAFA] rounded-3xl border border-border p-6 flex flex-col justify-center gap-4">
                   <div className="bg-white rounded-2xl border border-border shadow-card p-4 flex items-start gap-4">
                     <div className="flex-1">
                       <p className="text-sm font-semibold text-ink-900 mb-1">Fuktfläck i taket</p>
                       <p className="text-xs text-ink-500">ÄR-4012 • Prio 1</p>
                     </div>
                   </div>
                   <div className="bg-white rounded-2xl border border-border shadow-card p-4 flex items-start gap-4 opacity-60">
                     <div className="flex-1">
                       <p className="text-sm font-semibold text-ink-900 mb-1">Kallt i lägenheten</p>
                       <p className="text-xs text-ink-500">ÄR-4011 • Normal</p>
                     </div>
                   </div>
                </div>
                <h4 className="text-2xl font-semibold text-ink-950 mb-3 tracking-tight">Ärendehantering</h4>
                <p className="text-ink-600 text-base leading-relaxed flex-1 font-medium">Rent flöde för felanmälningar. Ta emot, prioritera och skapa arbetsordrar utan onödigt brus.</p>
              </div>

              {/* Feature 3 */}
              <div className="flex flex-col">
                <div className="mb-8 h-56 bg-[#FAFAFA] rounded-3xl border border-border p-6 overflow-hidden relative flex justify-center items-end">
                   <div className="w-40 bg-white rounded-t-3xl border-t-8 border-x-8 border-[#2E372F] shadow-lg h-[160px] flex flex-col pt-3">
                     <div className="w-12 h-1.5 bg-border rounded-full mx-auto mb-4"></div>
                     <div className="px-5 pb-3 border-b border-border">
                       <p className="text-xs font-semibold text-center text-ink-900">Min Bostad</p>
                     </div>
                     <div className="p-4 flex-1 bg-[#FAFAFA]">
                       <div className="bg-white rounded-xl p-3 border border-border shadow-sm">
                         <p className="text-[10px] font-semibold text-ink-900 mb-1">Meddelande</p>
                         <p className="text-[9px] text-ink-500 leading-relaxed">Vattnet stängs av kl 10-12.</p>
                       </div>
                     </div>
                   </div>
                </div>
                <h4 className="text-2xl font-semibold text-ink-950 mb-3 tracking-tight">Boendeportal</h4>
                <p className="text-ink-600 text-base leading-relaxed flex-1 font-medium">Elegant app för hyresgäster. Skapa ärenden, läs driftinfo och betala hyran direkt via mobilen.</p>
              </div>

              {/* Feature 4 */}
              <div className="flex flex-col">
                <div className="mb-8 h-56 bg-[#FAFAFA] rounded-3xl border border-border p-6 flex items-center justify-center">
                   <div className="bg-white rounded-2xl border border-border shadow-card p-5 w-full">
                     <div className="flex items-center gap-4 mb-5">
                       <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center text-sm font-semibold text-primary">EJ</div>
                       <div>
                         <p className="text-base font-semibold text-ink-900">Erik Johansson</p>
                         <p className="text-xs text-ink-500">Fastighetstekniker</p>
                       </div>
                     </div>
                     <div className="flex gap-2">
                       <span className="text-[11px] px-3 py-1.5 bg-[#FAFAFA] text-ink-600 rounded-lg font-medium border border-border">VVS</span>
                       <span className="text-[11px] px-3 py-1.5 bg-[#FAFAFA] text-ink-600 rounded-lg font-medium border border-border">Inre skötsel</span>
                     </div>
                   </div>
                </div>
                <h4 className="text-2xl font-semibold text-ink-950 mb-3 tracking-tight">Team</h4>
                <p className="text-ink-600 text-base leading-relaxed flex-1 font-medium">Tilldela rätt uppgift till rätt person. Följ upp tid och åtgärder per tekniker i en lugn översikt.</p>
              </div>

              {/* Feature 5 */}
              <div className="flex flex-col">
                <div className="mb-8 h-56 bg-[#FAFAFA] rounded-3xl border border-border p-6 flex flex-col justify-center gap-3">
                   {[
                     { name: "OVK-Protokoll_2024.pdf", size: "2.4 MB" },
                     { name: "Ritning_Källare_A.dwg", size: "14.1 MB" },
                     { name: "Serviceavtal_Hiss.doc", size: "124 KB" },
                   ].map((doc, i) => (
                     <div key={i} className={`bg-white rounded-xl border border-border shadow-sm px-4 py-3 flex items-center justify-between ${i === 2 ? 'opacity-50' : ''}`}>
                       <div>
                         <p className="text-sm font-medium text-ink-900">{doc.name}</p>
                         <p className="text-[10px] text-ink-400 mt-1">{doc.size}</p>
                       </div>
                       <svg className="w-4 h-4 text-ink-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                     </div>
                   ))}
                </div>
                <h4 className="text-2xl font-semibold text-ink-950 mb-3 tracking-tight">Dokumentarkiv</h4>
                <p className="text-ink-600 text-base leading-relaxed flex-1 font-medium">Ordning på ritningar och OVK-protokoll. Kopplat direkt till rätt fastighet utan krångel.</p>
              </div>

              {/* Feature 6 */}
              <div className="flex flex-col">
                <div className="mb-8 h-56 bg-[#FAFAFA] rounded-3xl border border-border p-6 flex items-center justify-center">
                   <div className="bg-white rounded-2xl border border-border shadow-card p-5 w-full">
                     <div className="flex items-center justify-between mb-4">
                       <span className="text-xs font-semibold text-ink-500">AI-Analys</span>
                     </div>
                     <p className="text-sm text-ink-800 leading-relaxed font-medium mb-5">
                       "Ökad frekvens av värmerelaterade felanmälningar i hus B. Underlag för fakturering redo."
                     </p>
                     <div className="flex gap-2">
                       <div className="flex-1 h-1 bg-primary rounded-full"></div>
                       <div className="flex-1 h-1 bg-border rounded-full"></div>
                     </div>
                   </div>
                </div>
                <h4 className="text-2xl font-semibold text-ink-950 mb-3 tracking-tight">AI & Fakturering</h4>
                <p className="text-ink-600 text-base leading-relaxed flex-1 font-medium">Låt systemet hitta avvikelser och förenkla underlaget för smidig fakturering.</p>
              </div>

            </div>
          </div>
        </section>

      </main>
      <SiteFooter />
    </>
  );
}
