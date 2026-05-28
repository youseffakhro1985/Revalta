import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-sand-50 font-sans text-ink-900">
      <header className="sticky top-0 z-20 border-b border-sand-200/80 bg-sand-50/80 shadow-sm backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-8">
              <Link href="/dashboard" className="text-2xl font-extrabold text-petroleum-600 tracking-tighter transition-opacity hover:opacity-80">
                Revalta
              </Link>
              <nav className="hidden md:flex space-x-1">
                <Link href="/dashboard" className="text-ink-600 hover:text-petroleum-600 px-3 py-2 text-sm font-medium transition-colors duration-300">Översikt</Link>
                <Link href="/dashboard/fastigheter" className="text-ink-600 hover:text-petroleum-600 px-3 py-2 text-sm font-medium transition-colors duration-300">Fastigheter</Link>
                <Link href="/dashboard/felanmalan" className="text-ink-600 hover:text-petroleum-600 px-3 py-2 text-sm font-medium transition-colors duration-300">Mina Ärenden</Link>
                <Link href="/dashboard/team" className="text-ink-600 hover:text-petroleum-600 px-3 py-2 text-sm font-medium transition-colors duration-300">Team</Link>
                <Link href="/dashboard/audit" className="text-ink-600 hover:text-petroleum-600 px-3 py-2 text-sm font-medium transition-colors duration-300">Audit</Link>
                <Link href="/dashboard/integrationer" className="text-ink-600 hover:text-petroleum-600 px-3 py-2 text-sm font-medium transition-colors duration-300">Integrationer</Link>
                <Link href="/dashboard/drift" className="text-ink-600 hover:text-petroleum-600 px-3 py-2 text-sm font-medium transition-colors duration-300">Drift</Link>
                <Link href="/dashboard/billing" className="text-ink-600 hover:text-petroleum-600 px-3 py-2 text-sm font-medium transition-colors duration-300">Billing</Link>
              </nav>
            </div>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="flex-1 w-full max-w-7xl mx-auto py-10 px-4 sm:px-6 lg:px-8 animate-fade-in-soft">
        {children}
      </main>
    </div>
  );
}
