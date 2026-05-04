import Link from "next/link";

export default function TicketDetailPage({ params }: { params: { id: string } }) {
  return (
    <div className="animate-fade-in max-w-4xl mx-auto">
      <div className="mb-6">
        <Link href="/dashboard/felanmalan" className="text-brand-600 hover:text-brand-700 font-medium text-sm flex items-center transition-colors">
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          Tillbaka till alla ärenden
        </Link>
      </div>
      
      <div className="bg-white p-10 rounded-2xl shadow-card border border-slate-100 animate-slide-up">
        <div className="flex justify-between items-start mb-8 pb-6 border-b border-slate-100">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900 mb-2 tracking-tight">Ärende #{params.id}</h1>
            <p className="text-slate-500 font-medium">Skapad den: {new Date().toLocaleDateString('sv-SE')}</p>
          </div>
          <span className="px-4 py-1.5 bg-warning-50 text-warning-600 rounded-full text-sm font-bold tracking-wide border border-warning-100 shadow-sm">ÖPPEN</span>
        </div>
        
        <div className="prose prose-slate max-w-none">
          <h3 className="text-xl font-bold mb-4 text-slate-900">Beskrivning</h3>
          <div className="bg-slate-50 p-6 rounded-xl border border-slate-100 text-slate-700 leading-relaxed">
            Detta är en platshållare för ärendebeskrivningen. När databasen är fullt integrerad kommer detaljerna för detta ärende att visas här, komplett med formatering och eventuella bifogade bilder.
          </div>
        </div>
      </div>
    </div>
  );
}
