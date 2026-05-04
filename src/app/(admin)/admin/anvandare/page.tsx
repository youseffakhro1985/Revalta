import db from "@/lib/db";
import { Badge } from "@/components/ui/badge";

export default async function AdminUsersPage() {
  const users = await db.user.findMany({
    where: { deletedAt: null },
    include: {
      memberships: {
        include: { company: true },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-700">Admin</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950">Användare</h1>
        <p className="mt-2 text-slate-600">Verifieringsstatus, roller och företagskopplingar.</p>
      </header>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-card">
        <div className="divide-y divide-slate-100">
          {users.map((user) => {
            const membership = user.memberships[0];
            return (
              <div key={user.id} className="grid gap-4 p-5 md:grid-cols-[1fr_220px_170px]">
                <div>
                  <p className="font-semibold text-slate-950">{user.firstName} {user.lastName}</p>
                  <p className="mt-1 text-sm text-slate-500">{user.email}</p>
                </div>
                <p className="text-sm text-slate-600">{membership?.company.companyName ?? "Ingen företagskoppling"}</p>
                <div className="flex gap-2 md:justify-end">
                  <Badge variant="outline">{membership?.role ?? user.role}</Badge>
                  <Badge variant={user.status === "active" ? "success" : "warning"}>{user.status}</Badge>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
