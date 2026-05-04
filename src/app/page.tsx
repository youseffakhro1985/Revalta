import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gray-50">
      <div className="max-w-3xl text-center space-y-6">
        <h1 className="text-5xl font-extrabold text-gray-900 tracking-tight">
          Välkommen till <span className="text-primary">Revalta</span>
        </h1>
        <p className="text-xl text-gray-600">
          Framtidens plattform för felanmälan och modern fastighetsservice. 
          Hantera dina ärenden snabbt och effektivt.
        </p>
        <div className="flex gap-4 justify-center pt-8">
          <Link 
            href="/login" 
            className="px-8 py-3 bg-primary text-white font-medium rounded-lg hover:bg-blue-800 transition-colors shadow-sm"
          >
            Logga in
          </Link>
          <Link 
            href="/register" 
            className="px-8 py-3 bg-white text-primary border border-gray-200 font-medium rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors shadow-sm"
          >
            Skapa konto
          </Link>
        </div>
      </div>
    </main>
  );
}
