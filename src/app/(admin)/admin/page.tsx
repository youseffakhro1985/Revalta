import db from "@/lib/db";

export default async function AdminDashboardPage() {
  const [companies, users, registrations, blockedCompanies, logs] = await Promise.all([
    db.company.count({ where: { deletedAt: null } }),
    db.user.count({ where: { deletedAt: null } }),
    db.registration.count({ where: { status: "pending_review" } }),
    db.company.count({ where: { status: "blocked", deletedAt: null } }),
    db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 6 }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Super admin</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-slate-950">Ägaröversikt</h1>
        <p className="mt-2 text-slate-600">Kontrollpanel för Revaltas kunder, användare och plattformshändelser.</p>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        {[
          ["Företag", companies],
          ["Användare", users],
          ["Väntande registreringar", registrations],
          ["Blockerade företag", blockedCompanies],
        ].map(([label, value]) => (
          <div key={label} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-3 text-3xl font-bold text-slate-950">{value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white shadow-card">
        <div className="border-b border-slate-100 p-6">
          <h2 className="font-bold text-slate-950">Senaste audit logs</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {logs.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">Inga loggar ännu.</p>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="p-5">
                <p className="font-semibold text-slate-950">{log.action}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {log.entityType} - {new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" }).format(log.createdAt)}
                </p>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
