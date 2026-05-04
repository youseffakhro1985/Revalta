import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, Building2, ClipboardCheck, Settings, Shield, Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/permissions";
import { LogoutButton } from "@/components/logout-button";

const adminNav = [
  { href: "/admin", label: "Översikt", icon: Shield },
  { href: "/admin/registreringar", label: "Registreringar", icon: ClipboardCheck },
  { href: "/admin/foretag", label: "Företag", icon: Building2 },
  { href: "/admin/anvandare", label: "Användare", icon: Users },
  { href: "/admin/loggar", label: "Audit logs", icon: Activity },
  { href: "/admin/installningar", label: "Inställningar", icon: Settings },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!isPlatformAdmin(user.activeMembership.role)) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-[#f7f6f2] text-slate-950">
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-white/10 bg-slate-950 px-5 py-6 lg:block">
        <Link href="/admin" className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-sm font-bold text-slate-950">R</span>
          <div>
            <p className="text-lg font-semibold tracking-tight">Revalta Admin</p>
            <p className="text-xs text-slate-400">Owner control plane</p>
          </div>
        </Link>

        <nav className="mt-10 space-y-1">
          {adminNav.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/85 backdrop-blur-xl">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">Admin</p>
              <p className="text-sm font-semibold">{`${user.firstName} ${user.lastName}`}</p>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/dashboard" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Kundvy
              </Link>
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
