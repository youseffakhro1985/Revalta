import { redirect } from "next/navigation";
import { ShieldCheck, Users, UserRoundCog, Eye } from "lucide-react";
import db from "@/lib/db";
import { canManageCompany, getCurrentUser } from "@/lib/current-user";
import { MetricCard, PageHeader, Panel } from "@/components/dashboard/premium-ui";

const roles = [
  { key: "owner", label: "Ägare", description: "Full kontroll över organisation, ekonomi och systeminställningar." },
  { key: "admin", label: "Administratör", description: "Administrerar team, fastigheter, arbetsflöden och integrationer." },
  { key: "manager", label: "Förvaltare", description: "Hantera fastigheter, ärenden, arbetsordrar och rapportering." },
  { key: "technician", label: "Tekniker", description: "Arbeta med tilldelade ärenden, arbetsordrar och rapportering." },
  { key: "viewer", label: "Läsbehörighet", description: "Kan läsa relevant information men inte göra ändringar." },
  { key: "resident", label: "Boende", description: "Portalroll för boende. Har inte tillgång till förvaltarens arbetsyta eller adminmenyer." },
];

const permissions = [
  ["Översikt och rapporter", true, true, true, true, true, false],
  ["Fastigheter och objekt", true, true, true, false, true, false],
  ["Ärenden och arbetsordrar", true, true, true, true, true, false],
  ["Boendeportal (självservice)", true, true, true, false, false, true],
  ["Team och roller", true, true, false, false, false, false],
  ["Händelselogg", true, true, false, false, false, false],
  ["Integrationer", true, true, false, false, false, false],
  ["Abonnemang och betalning", true, true, false, false, false, false],
  ["Systeminställningar", true, true, false, false, false, false],
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

  const privileged = members.filter((member) => member.role === "owner" || member.role === "admin").length;
  const operational = members.filter((member) => member.role === "manager" || member.role === "technician").length;
  const viewers = members.filter((member) => member.role === "viewer").length;
  const residents = members.filter((member) => member.role === "resident").length;

  return (
    <div className="space-y-8 animate-fade-in-soft">
      <PageHeader eyebrow="Organisation" title="Roller och behörigheter" description="Tydlig ansvarsfördelning för säker och professionell fastighetsförvaltning." action={<div className="inline-flex items-center gap-2 rounded-xl border border-petroleum-100 bg-petroleum-50 px-4 py-3 text-sm font-semibold text-petroleum-800"><ShieldCheck className="h-5 w-5" />Säker rollstyrning</div>} />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={Users} label="Aktiva användare" value={members.length} />
        <MetricCard icon={UserRoundCog} label="Ägare och admin" value={privileged} hint="Kan hantera organisation och system" />
        <MetricCard icon={ShieldCheck} label="Operativa roller" value={operational} hint="Förvaltare och tekniker" />
        <MetricCard icon={Eye} label="Läsbehöriga" value={viewers} />
        <MetricCard icon={Users} label="Boende" value={residents} hint="Portalroll, inte förvaltarworkspace" />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {roles.map((role) => (
          <article key={role.key} className="rounded-2xl border border-sand-200 bg-white p-5 shadow-[0_1px_2px_rgba(17,34,31,0.04)]">
            <h2 className="font-semibold text-ink-950">{role.label}</h2>
            <p className="mt-2 text-sm leading-6 text-ink-500">{role.description}</p>
            <p className="mt-5 text-2xl font-semibold text-petroleum-800">{members.filter((member) => member.role === role.key).length}</p>
            <p className="text-xs uppercase tracking-wide text-ink-400">användare</p>
          </article>
        ))}
      </section>

      <Panel title="Behörighetsmatris" description="Standardbehörighet för respektive roll. Boende är avsedd för portal/självservice och ska inte användas som intern förvaltarroll." bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-sand-50 text-xs uppercase tracking-wide text-ink-500"><tr><th className="px-6 py-4">Område</th>{roles.map((role) => <th key={role.key} className="px-4 py-4 text-center">{role.label}</th>)}</tr></thead>
            <tbody className="divide-y divide-sand-100">
              {permissions.map(([label, ...values]) => <tr key={String(label)} className="hover:bg-sand-50/60"><td className="px-6 py-4 font-medium text-ink-800">{String(label)}</td>{values.map((allowed, index) => <td key={index} className="px-4 py-4 text-center"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${allowed ? "bg-petroleum-50 text-petroleum-700" : "bg-sand-50 text-ink-400"}`}>{allowed ? "Tillåten" : "Begränsad"}</span></td>)}</tr>)}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Användare och roller" description="Rolländringar görs från Team. Individuell fastighetsbehörighet och leverantörs-/styrelseroller kommer i nästa steg." bodyClassName="p-0">
        <div className="divide-y divide-sand-100">
          {members.map((member) => <div key={member.id} className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-ink-900">{member.name || "Namn saknas"}</p><p className="text-sm text-ink-500">{member.email}</p></div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-sand-200 bg-sand-50 px-3 py-1 text-xs font-semibold text-ink-600">{roles.find((role) => role.key === member.role)?.label || member.role}</span><span className="rounded-full border border-petroleum-100 bg-petroleum-50 px-3 py-1 text-xs font-semibold text-petroleum-700">{member.status === "active" ? "Aktiv" : member.status}</span></div></div>)}
        </div>
      </Panel>
    </div>
  );
}
