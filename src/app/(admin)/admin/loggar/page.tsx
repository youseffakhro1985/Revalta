import db from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLoggarPage() {
  await requireUser();
  const logs = await db.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      company: true,
      actor: { select: { firstName: true, lastName: true, email: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-700">Audit logs</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Plattformshändelser</h1>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-card">
        {logs.length === 0 ? (
          <p className="p-8 text-sm text-slate-500">Inga loggar ännu.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {logs.map((log) => (
              <div key={log.id} className="grid gap-2 p-5 md:grid-cols-[1fr_180px]">
                <div>
                  <p className="font-semibold text-slate-950">{log.action.replaceAll("_", " ")}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {log.entityType} {log.entityId ? `#${log.entityId.slice(0, 8)}` : ""} - {log.company?.companyName ?? "Plattform"}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {log.actor ? `${log.actor.firstName} ${log.actor.lastName}` : "System"}
                  </p>
                </div>
                <p className="text-sm text-slate-500 md:text-right">
                  {new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" }).format(log.createdAt)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
