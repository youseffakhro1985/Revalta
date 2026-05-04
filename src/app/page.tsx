import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-slate-50 animate-fade-in">
      <div className="max-w-3xl text-center space-y-8 animate-slide-up">
        <h1 className="text-6xl font-extrabold text-slate-900 tracking-tight leading-tight">
          Välkommen till <span className="text-brand-600">Revalta</span>
        </h1>
        <p className="text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">
          Framtidens plattform för felanmälan och modern fastighetsservice. 
          Hantera dina ärenden snabbt, säkert och effektivt.
        </p>
        <div className="flex gap-4 justify-center pt-8">
          <Link 
            href="/login" 
            className="px-8 py-3.5 bg-brand-600 text-white font-medium rounded-xl hover:bg-brand-700 transition-all shadow-card hover:shadow-card-md transform hover:-translate-y-0.5"
          >
            Logga in
          </Link>
          <Link 
            href="/register" 
            className="px-8 py-3.5 bg-white text-brand-700 border border-slate-200 font-medium rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm"
          >
            Skapa konto
          </Link>
        </div>
      </div>
    </main>
  );
}
