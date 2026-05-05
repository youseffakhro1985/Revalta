import Link from 'next/link';

export default function Dashboard() {
  return (
    <div className="animate-slide-up">
      <header className="mb-8">
        <h1 className="text-4xl font-bold text-slate-900 tracking-tight mb-2">Översikt</h1>
        <p className="text-slate-500">Här har du en samlad vy över dina fastighetstjänster.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-8 rounded-2xl shadow-card hover:shadow-card-md transition-shadow border border-slate-100 flex flex-col items-start group">
          <div className="w-12 h-12 bg-brand-50 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
            <svg className="w-6 h-6 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
          </div>
          <h2 className="text-xl font-bold mb-3 text-slate-900">Skapa ny felanmälan</h2>
          <p className="text-slate-600 mb-8 leading-relaxed flex-1">Har du upptäckt ett fel i fastigheten? Skapa en felanmälan snabbt och enkelt för snabbast möjliga service.</p>
          <Link href="/dashboard/felanmalan" className="inline-flex items-center px-6 py-3 bg-brand-600 text-white font-medium rounded-xl hover:bg-brand-700 transition-colors shadow-sm">
            Gå till felanmälan
          </Link>
        </div>

        <div className="bg-white p-8 rounded-2xl shadow-card hover:shadow-card-md transition-shadow border border-slate-100 flex flex-col items-start">
          <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center mb-6">
            <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
          </div>
          <h2 className="text-xl font-bold mb-3 text-slate-900">Mina ärenden</h2>
          <p className="text-slate-600 mb-8 leading-relaxed flex-1">Se status och historik för alla dina felanmälningar och följ upp pågående ärenden.</p>
          <Link href="/dashboard/felanmalan" className="inline-flex items-center px-6 py-3 border-2 border-slate-200 text-slate-700 font-medium rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-colors">
            Visa ärenden
          </Link>
        </div>
      </div>
    </div>
  );
}
