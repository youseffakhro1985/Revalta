"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock3, ShieldCheck, UsersRound } from "lucide-react";
import { EmptyState, InlineAlert, MetricCard, PageHeader, Panel, premiumFieldClass, premiumPrimaryButtonClass } from "@/components/dashboard/premium-ui";
import { readResponseJson } from "@/lib/fetch-json";

type TeamMember = { id: string; name: string | null; email: string; role: string; status: string; created_at: string; _count: { assigned_tickets: number } };
type TeamInvite = { id: string; email: string; name: string | null; role: string; expires_at: string; accepted_at: string | null; created_at: string };
const roleLabels: Record<string, string> = {
  owner: "Ägare",
  admin: "Admin",
  manager: "Förvaltare",
  technician: "Tekniker",
  viewer: "Läsbehörig",
  resident: "Boende",
};

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [companyName, setCompanyName] = useState("Organisation");
  const [canManage, setCanManage] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("technician");
  const [inviteUrl, setInviteUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const router = useRouter();

  const loadTeam = useCallback(async () => {
    setLoading(true);
    try {
      const [response, invitesResponse] = await Promise.all([fetch("/api/team", { cache: "no-store" }), fetch("/api/team/invites", { cache: "no-store" })]);
      if (response.status === 401 || invitesResponse.status === 401) { router.push("/login"); return; }
      const [data, invitesData] = await Promise.all([readResponseJson(response), readResponseJson(invitesResponse)]);
      if (!response.ok) throw new Error(data.error || "Kunde inte hämta teamet");
      setMembers(data.members || []); setCompanyName(data.company?.name || "Organisation"); setCanManage(Boolean(data.canManage));
      if (invitesResponse.ok) setInvites(invitesData.invites || []);
    } catch (err) { setError(err instanceof Error ? err.message : "Kunde inte kontakta servern"); }
    finally { setLoading(false); }
  }, [router]);

  useEffect(() => { void loadTeam(); }, [loadTeam]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault(); setError(""); setSuccess(""); setSubmitting(true);
    try {
      const response = await fetch("/api/team/invites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email, role }) });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte skapa inbjudan");
      setInvites((current) => [data.invite, ...current]); setInviteUrl(data.inviteUrl || ""); setName(""); setEmail(""); setRole("technician"); setSuccess("Inbjudan är skapad och redo att skickas.");
    } catch (err) { setError(err instanceof Error ? err.message : "Kunde inte kontakta servern"); }
    finally { setSubmitting(false); }
  }

  const assigned = useMemo(() => members.reduce((sum, member) => sum + Number(member._count.assigned_tickets || 0), 0), [members]);
  const pending = invites.filter((invite) => !invite.accepted_at).length;

  return <div className="space-y-8">
    <PageHeader eyebrow={companyName} title="Team" description="Hantera roller, ansvar, arbetsbelastning och säker åtkomst för hela förvaltningsorganisationen." />

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <MetricCard icon={UsersRound} label="Aktiva teammedlemmar" value={members.length} />
      <MetricCard icon={Clock3} label="Väntande inbjudningar" value={pending} />
      <MetricCard icon={ShieldCheck} label="Tilldelade ärenden" value={assigned} />
    </section>

    {error ? <InlineAlert>{error}</InlineAlert> : null}
    {success ? <InlineAlert tone="success">{success}</InlineAlert> : null}

    <section className="grid gap-6 xl:grid-cols-[390px_1fr]">
      <Panel title="Bjud in teammedlem" description="Skapa en säker inbjudan och välj rätt roll från början.">
        <form onSubmit={handleSubmit} className="space-y-4">
          <fieldset disabled={!canManage} className="space-y-4 disabled:opacity-60">
            <input placeholder="Namn" aria-label="Namn" value={name} onChange={(event) => setName(event.target.value)} className={premiumFieldClass} />
            <input type="email" required placeholder="E-post" aria-label="E-post" value={email} onChange={(event) => setEmail(event.target.value)} className={premiumFieldClass} />
            <select value={role} onChange={(event) => setRole(event.target.value)} aria-label="Roll" className={premiumFieldClass}><option value="admin">Admin</option><option value="manager">Förvaltare</option><option value="technician">Tekniker</option><option value="viewer">Läsbehörig</option><option value="resident">Boende</option></select>
            <button disabled={submitting || !canManage} className={`${premiumPrimaryButtonClass} w-full`}>{submitting ? "Skapar…" : "Skapa inbjudan"}</button>
          </fieldset>
        </form>
        {!canManage ? <p className="mt-4 text-xs leading-5 text-ink-500">Du behöver administratörsbehörighet för att bjuda in nya användare.</p> : null}
        {inviteUrl ? <div className="mt-5 rounded-xl border border-petroleum-100 bg-petroleum-50 p-4"><p className="text-xs font-semibold uppercase tracking-[0.1em] text-petroleum-700">Inbjudningslänk</p><p className="mt-2 break-all text-sm text-petroleum-800">{inviteUrl}</p></div> : null}
      </Panel>

      <Panel title="Team" description="Roller, status och aktuell arbetsbelastning." bodyClassName="p-0">
        {loading ? <div className="space-y-3 p-6">{[1,2,3].map((item) => <div key={item} className="h-20 animate-pulse rounded-xl bg-sand-100" />)}</div> : members.length === 0 ? <EmptyState title="Inga teammedlemmar" description="Bjud in den första kollegan för att bygga organisationen." /> : <div className="divide-y divide-sand-100">{members.map((member) => <article key={member.id} className="p-6 transition hover:bg-sand-50/70"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-semibold text-ink-900">{member.name || member.email}</h3><p className="mt-1 text-sm text-ink-500">{member.email}</p></div><div className="flex flex-wrap gap-2"><span className="rounded-full bg-petroleum-50 px-3 py-1 text-xs font-semibold text-petroleum-800">{roleLabels[member.role] || member.role}</span><span className="rounded-full bg-sand-100 px-3 py-1 text-xs font-semibold text-ink-600">{member._count.assigned_tickets} tilldelade</span></div></div></article>)}</div>}
      </Panel>
    </section>

    <Panel title="Senaste inbjudningar" description="Status för säkra inbjudningslänkar." bodyClassName="p-0">
      {invites.length === 0 ? <EmptyState title="Inga inbjudningar" description="Nya inbjudningar du skickar ut visas här tills de accepteras." /> : <div className="divide-y divide-sand-100">{invites.map((invite) => <article key={invite.id} className="p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-semibold text-ink-900">{invite.name || invite.email}</h3><p className="mt-1 text-sm text-ink-500">{invite.email}</p></div><div className="flex flex-wrap gap-2"><span className="rounded-full bg-petroleum-50 px-3 py-1 text-xs font-semibold text-petroleum-800">{roleLabels[invite.role] || invite.role}</span><span className={`rounded-full px-3 py-1 text-xs font-semibold ${invite.accepted_at ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>{invite.accepted_at ? "Accepterad" : "Väntar"}</span></div></div></article>)}</div>}
    </Panel>
  </div>;
}