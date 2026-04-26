import Link from "next/link";
import { LayoutDashboard, FileText, Building, Users, Settings, LogOut } from "lucide-react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-muted/40">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-10 hidden w-64 flex-col border-r bg-background sm:flex">
        <div className="flex h-16 items-center border-b px-6">
          <span className="font-extrabold text-lg text-primary tracking-tight">Revalta</span>
        </div>
        <nav className="flex flex-1 flex-col gap-2 p-4">
          <Link href="/dashboard" className="flex items-center gap-3 rounded-lg bg-primary/10 px-3 py-2 text-primary transition-all">
            <LayoutDashboard className="h-4 w-4" />
            <span className="font-medium text-sm">Översikt</span>
          </Link>
          <Link href="/dashboard/tickets" className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all">
            <FileText className="h-4 w-4" />
            <span className="font-medium text-sm">Felanmälningar</span>
          </Link>
          <Link href="/dashboard/properties" className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all">
            <Building className="h-4 w-4" />
            <span className="font-medium text-sm">Fastigheter</span>
          </Link>
          <Link href="/dashboard/team" className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all">
            <Users className="h-4 w-4" />
            <span className="font-medium text-sm">Team</span>
          </Link>
          <div className="mt-auto flex flex-col gap-2">
            <Link href="/dashboard/settings" className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all">
              <Settings className="h-4 w-4" />
              <span className="font-medium text-sm">Inställningar</span>
            </Link>
            <Link href="/logout" className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all">
              <LogOut className="h-4 w-4" />
              <span className="font-medium text-sm">Logga ut</span>
            </Link>
          </div>
        </nav>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col sm:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-6">
          <div className="flex flex-1 items-center justify-end gap-4">
            <div className="h-8 w-8 rounded-full bg-primary/20 border border-primary/30" />
          </div>
        </header>
        <main className="flex-1 p-6 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
