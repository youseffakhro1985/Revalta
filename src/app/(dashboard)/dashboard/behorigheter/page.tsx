import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import db from "@/lib/db";
import { canManageCompany, getCurrentUser } from "@/lib/current-user";

const roles = [
  { key: "owner", label: "Ägare", description: "Full kontroll över organisation, ekonomi och systeminställningar." },
  { key: "admin", label: "Administratör", description: "Administrerar team, fastigheter, arbetsflöden och integrationer." },
  { key: "manager", label: "Förvaltare", description: "Hantera fastigheter, ärenden, arbetsordrar och rapportering." },
  { key: "technician", label: "Tekniker", description: "Arbeta med tilldelade ärenden, arbetsordrar och rapportering." },
  { key: "viewer", label: "Läsbehörighet", description: "Kan läsa relevant information men inte göra ändringar." },
];

const permissions = [
  ["Översikt och rapporter", true, true, true, true, true],
  ["Fastigheter och objekt", true, true, true, false, true],
  ["Ärenden och arbetsordrar", true, true, true, true, true],
  ["Team och roller", true, true, false, false, false],
  ["Händelselogg", true, true, false, false, false],
  ["Integrationer", true, true, false, false, false],
  ["Abonnemang och betalning", true, true, false, false, false],
  ["Systeminställningar", true, true, false, false, false],
];

export default async function PermissionsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canManageCompany(user.role)) redirect("/dashboard");

  const members = await db.user.findMany({
    where: user.company_id ? { company_id: user.company_id } : { id: user.id },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, role: true, status: true },
  });

  return (
    <div className="animate-fade-in-soft space-y-6">
      <header className="rounded-2xl border border-sand-200 bg-white p-7 shadow-premium-sm sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-petroleum-600">Organisation</p>
            <h1 className="text-[32px] font-semibold tracking-[-0.035em] text-ink-950 sm:text-[36px]">Roller och behörigheter</h1>
            <p className="mt-3 max-w-2xl text-ink-600">Tydlig ansvarsfördelning för säker och professionell fastighetsförvaltning.</p>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-petroleum-100 bg-petroleum-50 px-4 py-3 text-sm font-semibold text-petroleum-800">
            <ShieldCheck className="h-5 w-5" /> {members.length} aktiva användare
          </div>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-5">
        {roles.map((role) => (
          <article key={role.key} className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm">
            <h2 className="font-semibold text-ink-950">{role.label}</h2>
            <p className="mt-2 text-sm leading-6 text-ink-500">{role.description}</p>
            <p className="mt-5 text-2xl font-semibold text-petroleum-800">{members.filter((member) => member.role === role.key).length}</p>
            <p className="text-xs uppercase tracking-wide text-ink-400">användare</p>
          </article>
        ))}
      </section>

      <section className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-premium-sm">
        <div className="border-b border-sand-200 px-6 py-5">
          <h2 className="text-xl font-semibold text-ink-950">Behörighetsmatris</h2>
          <p className="mt-1 text-sm text-ink-500">Standardbehörighet för respektive roll.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead className="bg-sand-50 text-xs uppercase tracking-wide text-ink-500">
              <tr><th className="px-6 py-4">Område</th>{roles.map((role) => <th key={role.key} className="px-4 py-4 text-center">{role.label}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {permissions.map(([label, ...values]) => (
                <tr key={String(label)}><td className="px-6 py-4 font-medium text-ink-800">{String(label)}</td>{values.map((allowed, index) => <td key={index} className="px-4 py-4 text-center"><span className={allowed ? "text-petroleum-700" : "text-ink-300"}>{allowed ? "Tillåten" : "Begränsad"}</span></td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-premium-sm">
        <div className="border-b border-sand-200 px-6 py-5"><h2 className="text-xl font-semibold text-ink-950">Användare och roller</h2><p className="mt-1 text-sm text-ink-500">Rolländringar görs från Team tills individuell fastighetsbehörighet är aktiverad.</p></div>
        <div className="divide-y divide-sand-100">
          {members.map((member) => <div key={member.id} className="flex flex-col gap-2 px-6 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-ink-900">{member.name || "Namn saknas"}</p><p className="text-sm text-ink-500">{member.email}</p></div><div className="flex items-center gap-2"><span className="rounded-full border border-sand-200 bg-sand-50 px-3 py-1 text-xs font-semibold text-ink-600">{roles.find((role) => role.key === member.role)?.label || member.role}</span><span className="rounded-full border border-petroleum-100 bg-petroleum-50 px-3 py-1 text-xs font-semibold text-petroleum-700">{member.status === "active" ? "Aktiv" : member.status}</span></div></div>)}
        </div>
      </section>
    </div>
  );
}
