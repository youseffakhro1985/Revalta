import Link from "next/link";
import { LogOut, ShieldAlert, Users, Building, Activity, FileText } from "lucide-react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-muted/20">
      {/* Admin Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-10 hidden w-64 flex-col border-r bg-slate-950 text-slate-50 sm:flex">
        <div className="flex h-16 items-center border-b border-slate-800 px-6">
          <ShieldAlert className="h-5 w-5 text-red-500 mr-2" />
          <span className="font-bold text-lg tracking-tight">Revalta Admin</span>
        </div>
        <nav className="flex flex-1 flex-col gap-2 p-4">
          <Link href="/admin" className="flex items-center gap-3 rounded-lg bg-slate-800 px-3 py-2 text-white transition-all">
            <Activity className="h-4 w-4" />
            <span className="font-medium text-sm">Systemstatus</span>
          </Link>
          <Link href="/admin/companies" className="flex items-center gap-3 rounded-lg px-3 py-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-all">
            <Building className="h-4 w-4" />
            <span className="font-medium text-sm">Företag (Tenants)</span>
          </Link>
          <Link href="/admin/users" className="flex items-center gap-3 rounded-lg px-3 py-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-all">
            <Users className="h-4 w-4" />
            <span className="font-medium text-sm">Alla Användare</span>
          </Link>
          <Link href="/admin/registrations" className="flex items-center gap-3 rounded-lg px-3 py-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-all">
            <FileText className="h-4 w-4" />
            <span className="font-medium text-sm">Registreringar</span>
          </Link>
          <div className="mt-auto flex flex-col gap-2">
            <Link href="/logout" className="flex items-center gap-3 rounded-lg px-3 py-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-all">
              <LogOut className="h-4 w-4" />
              <span className="font-medium text-sm">Logga ut</span>
            </Link>
          </div>
        </nav>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col sm:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-6">
          <div className="flex flex-1 items-center">
            <h1 className="text-lg font-semibold text-slate-800">Super Admin Portal</h1>
          </div>
          <div className="flex items-center justify-end gap-4">
            <div className="h-8 w-8 rounded-full bg-slate-200 border border-slate-300" />
          </div>
        </header>
        <main className="flex-1 p-6 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
