"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 font-sans">
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-8">
              <Link href="/dashboard" className="text-2xl font-extrabold text-brand-600 tracking-tight transition-transform hover:scale-105">
                Revalta
              </Link>
              <nav className="hidden md:flex space-x-2">
                <Link href="/dashboard" className="text-slate-600 hover:text-brand-600 hover:bg-brand-50 px-3 py-2 rounded-lg text-sm font-medium transition-colors">Översikt</Link>
                <Link href="/dashboard/felanmalan" className="text-slate-600 hover:text-brand-600 hover:bg-brand-50 px-3 py-2 rounded-lg text-sm font-medium transition-colors">Mina Ärenden</Link>
              </nav>
            </div>
            <div>
              <button
                onClick={handleLogout}
                className="text-sm font-medium text-slate-500 hover:text-slate-900 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors"
              >
                Logga ut
              </button>
            </div>
          </div>
        </div>
      </header>
      <main className="flex-1 w-full max-w-7xl mx-auto py-10 px-4 sm:px-6 lg:px-8 animate-fade-in">
        {children}
      </main>
    </div>
  );
}
