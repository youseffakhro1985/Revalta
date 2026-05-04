import db from "@/lib/db";
import { Badge } from "@/components/ui/badge";

export default async function AdminCompaniesPage() {
  const companies = await db.company.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { members: true, properties: true, tickets: true },
      },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-700">Företag</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-950">Företagsregister</h1>
        <p className="mt-2 text-slate-600">Alla tenant-bolag med status, plan och operativ volym.</p>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.16em] text-slate-500">
              <tr>
                <th className="px-5 py-4">Företag</th>
                <th className="px-5 py-4">Plan</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4">Användare</th>
                <th className="px-5 py-4">Fastigheter</th>
                <th className="px-5 py-4">Ärenden</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {companies.map((company) => (
                <tr key={company.id}>
                  <td className="px-5 py-4">
                    <p className="font-semibold text-slate-950">{company.companyName}</p>
                    <p className="text-xs text-slate-500">{company.email ?? "Ingen e-post"}</p>
                  </td>
                  <td className="px-5 py-4">{company.plan}</td>
                  <td className="px-5 py-4"><Badge variant="outline">{company.status}</Badge></td>
                  <td className="px-5 py-4">{company._count.members}</td>
                  <td className="px-5 py-4">{company._count.properties}</td>
                  <td className="px-5 py-4">{company._count.tickets}</td>
                </tr>
              ))}
              {companies.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-slate-500">Inga företag finns ännu.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
