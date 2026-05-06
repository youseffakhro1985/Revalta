import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 shadow-sm backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-8">
              <Link href="/dashboard" className="text-2xl font-extrabold text-brand-600 tracking-tight transition-transform hover:scale-105">
                Revalta
              </Link>
              <nav className="hidden md:flex space-x-2">
                <Link href="/dashboard" className="text-slate-600 hover:text-brand-600 hover:bg-brand-50 px-3 py-2 rounded-lg text-sm font-medium transition-colors">Översikt</Link>
                <Link href="/dashboard/fastigheter" className="text-slate-600 hover:text-brand-600 hover:bg-brand-50 px-3 py-2 rounded-lg text-sm font-medium transition-colors">Fastigheter</Link>
                <Link href="/dashboard/felanmalan" className="text-slate-600 hover:text-brand-600 hover:bg-brand-50 px-3 py-2 rounded-lg text-sm font-medium transition-colors">Mina Ärenden</Link>
              </nav>
            </div>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="flex-1 w-full max-w-7xl mx-auto py-10 px-4 sm:px-6 lg:px-8 animate-fade-in">
        {children}
      </main>
    </div>
  );
}
