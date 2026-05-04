import Link from "next/link";
import { Bell, Building2, FileText, Home, Settings, ShieldCheck, Ticket } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { LogoutButton } from "@/components/logout-button";

const navItems = [
  { href: "/dashboard", label: "Översikt", icon: Home },
  { href: "/dashboard/fastigheter", label: "Fastigheter", icon: Building2 },
  { href: "/dashboard/felanmalan", label: "Felanmälan", icon: Ticket },
  { href: "/dashboard/dokument", label: "Dokument", icon: FileText },
  { href: "/dashboard/team", label: "Team", icon: ShieldCheck },
  { href: "/dashboard/installningar", label: "Inställningar", icon: Settings },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <div className="min-h-screen bg-[#f7f6f2] font-sans text-slate-950">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-slate-200/80 bg-white/90 px-5 py-6 backdrop-blur-xl lg:block">
        <Link href="/dashboard" className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-sm font-bold text-white">R</span>
          <div>
            <p className="text-lg font-semibold tracking-tight">Revalta</p>
            <p className="text-xs text-slate-500">AI fastighetsförvaltare</p>
          </div>
        </Link>

        <nav className="mt-10 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-6 left-5 right-5 rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Företag</p>
          <p className="mt-2 truncate text-sm font-semibold text-slate-900">{user.activeCompany.companyName}</p>
          <p className="mt-1 text-xs text-slate-500">{user.activeMembership.role.replaceAll("_", " ")}</p>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-[#f7f6f2]/80 backdrop-blur-xl">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-400">Workspace</p>
              <p className="text-sm font-semibold text-slate-900">{user.activeCompany.companyName}</p>
            </div>
            <div className="flex items-center gap-3">
              <button className="rounded-full border border-slate-200 bg-white p-2 text-slate-500 shadow-sm">
                <Bell className="h-4 w-4" />
              </button>
              <div className="hidden text-right sm:block">
                <p className="text-sm font-semibold text-slate-900">{`${user.firstName} ${user.lastName}`}</p>
                <p className="text-xs text-slate-500">{user.email}</p>
              </div>
              <LogoutButton />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
