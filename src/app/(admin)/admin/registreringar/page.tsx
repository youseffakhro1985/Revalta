import db from "@/lib/db";
import { Badge } from "@/components/ui/badge";

export default async function AdminRegistreringarPage() {
  const registrations = await db.registration.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-700">Admin</p>
        <h1 className="mt-2 text-3xl font-extrabold text-slate-950">Registreringar</h1>
      </div>
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-card">
        {registrations.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">Inga registreringar väntar på granskning.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {registrations.map((registration) => (
              <div key={registration.id} className="grid gap-4 p-5 md:grid-cols-[1fr_160px_180px]">
                <div>
                  <p className="font-semibold text-slate-950">{registration.companyName}</p>
                  <p className="mt-1 text-sm text-slate-500">{registration.contactName} - {registration.email}</p>
                </div>
                <Badge variant="outline">{registration.companyType}</Badge>
                <Badge variant={registration.status === "pending_review" ? "warning" : "secondary"}>
                  {registration.status.replaceAll("_", " ")}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
