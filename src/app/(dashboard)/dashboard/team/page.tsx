"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock3, ShieldCheck, UsersRound } from "lucide-react";
import { EmptyState, InlineAlert, MetricCard, PageHeader, Panel, premiumFieldClass, premiumPrimaryButtonClass } from "@/components/dashboard/premium-ui";
import { readResponseJson } from "@/lib/fetch-json";

type TeamMember = {
  id: string;
  name: string | null;
  email?: string;
  role: string;
  status: string;
  created_at?: string;
  _count?: { assigned_tickets: number };
};
type TeamInvite = { id: string; email: string; name: string | null; role: string; expires_at: string; accepted_at: string | null; created_at: string };
type TeamPermissions = { canManage: boolean; canSeeEmails: boolean };
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
  const [permissions, setPermissions] = useState<TeamPermissions>({ canManage: false, canSeeEmails: false });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("technician");
  const [inviteUrl, setInviteUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [updatingMemberId, setUpdatingMemberId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const router = useRouter();
  const manageableRoles = ["admin", "manager", "technician", "viewer", "resident"];
  const canManage = permissions.canManage;

  const loadTeam = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/team", { cache: "no-store" });
      if (response.status === 401) { router.push("/login"); return; }
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte hämta teamet");

      const nextPermissions: TeamPermissions = {
        canManage: Boolean(data.permissions?.canManage ?? data.canManage),
        canSeeEmails: Boolean(data.permissions?.canSeeEmails),
      };
      setMembers(data.members || []);
      setCompanyName(data.company?.name || "Organisation");
      setPermissions(nextPermissions);

      if (nextPermissions.canManage) {
        const invitesResponse = await fetch("/api/team/invites", { cache: "no-store" });
        if (invitesResponse.status === 401) { router.push("/login"); return; }
        const invitesData = await readResponseJson(invitesResponse);
        if (!invitesResponse.ok) throw new Error(invitesData.error || "Kunde inte hämta inbjudningar");
        setInvites(invitesData.invites || []);
      } else {
        setInvites([]);
      }
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
      setInvites((current) => [data.invite, ...current]); setInviteUrl(data.inviteUrl || ""); setName(""); setEmail(""); setRole("technician");
      if (data.deliveryStatus === "failed") {
        setError("Inbjudan skapades, men e-postleveransen misslyckades. Kontrollera integrationsloggen innan du skapar en ny inbjudan.");
      } else if (data.deliveryStatus === "mocked") {
        setSuccess("Inbjudan är skapad i utvecklingsläge. Använd den lokala inbjudningslänken nedan.");
      } else {
        setSuccess("Inbjudan är skapad och skickad till mottagaren.");
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Kunde inte kontakta servern"); }
    finally { setSubmitting(false); }
  }

  async function handleMemberUpdate(member: TeamMember, patch: { role?: string; status?: string }) {
    setError(""); setSuccess(""); setUpdatingMemberId(member.id);
    try {
      const response = await fetch(`/api/team/${member.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte uppdatera teammedlemmen");
      setMembers((current) => current.map((existing) => (existing.id === member.id ? data.member : existing)));
      setSuccess(patch.status ? (patch.status === "active" ? "Medlemmen är återaktiverad." : "Medlemmen är inaktiverad.") : "Rollen är uppdaterad.");
    } catch (err) { setError(err instanceof Error ? err.message : "Kunde inte kontakta servern"); }
    finally { setUpdatingMemberId(""); }
  }

  const activeMembers = useMemo(() => members.filter((member) => member.status === "active").length, [members]);
  const assigned = useMemo(() => members.reduce((sum, member) => sum + Number(member._count?.assigned_tickets ?? 0), 0), [members]);
  const pending = invites.filter((invite) => !invite.accepted_at).length;

  return <div className="space-y-8">
    <PageHeader eyebrow={companyName} title="Team" description="Hantera roller, ansvar, arbetsbelastning och säker åtkomst för hela förvaltningsorganisationen." />

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <MetricCard icon={UsersRound} label="Aktiva teammedlemmar" value={activeMembers} />
      <MetricCard icon={Clock3} label="Väntande inbjudningar" value={canManage ? pending : "–"} hint={!canManage ? "Visas endast för administratörer." : undefined} />
      <MetricCard icon={ShieldCheck} label="Tilldelade ärenden" value={permissions.canSeeEmails ? assigned : "–"} hint={!permissions.canSeeEmails ? "Arbetsbelastning visas endast för roller med utökad teamåtkomst." : undefined} />
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
            <button disabled={submitting || !canManage} className={`${premiumPrimaryButtonClass} w-full`}>{submitting ? "Skickar…" : "Skicka inbjudan"}</button>
          </fieldset>
        </form>
        {!canManage ? <p className="mt-4 text-xs leading-5 text-ink-500">Du behöver administratörsbehörighet för att bjuda in nya användare.</p> : null}
        {inviteUrl ? <div className="mt-5 rounded-xl border border-petroleum-100 bg-petroleum-50 p-4"><p className="text-xs font-semibold uppercase tracking-[0.1em] text-petroleum-700">Inbjudningslänk för lokal utveckling</p><p className="mt-2 break-all text-sm text-petroleum-800">{inviteUrl}</p></div> : null}
      </Panel>

      <Panel title="Team" description={permissions.canSeeEmails ? "Roller, status och aktuell arbetsbelastning." : "Aktiva kollegor och roller som du har behörighet att se."} bodyClassName="p-0">
        {loading ? <div className="space-y-3 p-6">{[1,2,3].map((item) => <div key={item} className="h-20 animate-pulse rounded-xl bg-sand-100" />)}</div> : members.length === 0 ? <EmptyState title="Inga teammedlemmar" description={canManage ? "Bjud in den första kollegan för att bygga organisationen." : "Det finns inga teammedlemmar att visa med din nuvarande behörighet."} /> : <div className="divide-y divide-sand-100">{members.map((member) => {
          const displayName = member.name || member.email || "Teammedlem";
          return <article key={member.id} className="p-6 transition hover:bg-sand-50/70"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-semibold text-ink-900">{displayName}</h3>{permissions.canSeeEmails && member.email ? <p className="mt-1 text-sm text-ink-500">{member.email}</p> : null}</div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${member.status === "active" ? "bg-petroleum-50 text-petroleum-800" : "bg-sand-100 text-ink-500"}`}>{roleLabels[member.role] || member.role}</span>{permissions.canSeeEmails && member._count ? <span className="rounded-full bg-sand-100 px-3 py-1 text-xs font-semibold text-ink-600">{member._count.assigned_tickets} tilldelade</span> : null}{member.status !== "active" ? <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">Inaktiv</span> : null}</div></div>{canManage ? <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-sand-100 pt-4"><select aria-label={`Roll för ${displayName}`} value={member.role === "owner" ? "owner" : member.role} disabled={updatingMemberId === member.id || member.role === "owner"} onChange={(event) => void handleMemberUpdate(member, { role: event.target.value })} className="h-9 rounded-lg border border-sand-200 bg-white px-2 text-xs text-ink-700 outline-none focus:border-petroleum-500 disabled:cursor-not-allowed disabled:opacity-50">{member.role === "owner" ? <option value="owner">Ägare</option> : null}{manageableRoles.map((roleOption) => <option key={roleOption} value={roleOption}>{roleLabels[roleOption]}</option>)}</select><button type="button" disabled={updatingMemberId === member.id} onClick={() => void handleMemberUpdate(member, { status: member.status === "active" ? "inactive" : "active" })} className="inline-flex h-9 items-center rounded-lg border border-sand-200 px-3 text-xs font-semibold text-ink-700 hover:bg-sand-50 disabled:cursor-not-allowed disabled:opacity-50">{updatingMemberId === member.id ? "Uppdaterar…" : member.status === "active" ? "Inaktivera" : "Återaktivera"}</button></div> : null}</article>;
        })}</div>}
      </Panel>
    </section>

    {canManage ? <Panel title="Senaste inbjudningar" description="Status för säkra inbjudningslänkar." bodyClassName="p-0">
      {invites.length === 0 ? <EmptyState title="Inga inbjudningar" description="Nya inbjudningar du skickar ut visas här tills de accepteras." /> : <div className="divide-y divide-sand-100">{invites.map((invite) => <article key={invite.id} className="p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-semibold text-ink-900">{invite.name || invite.email}</h3><p className="mt-1 text-sm text-ink-500">{invite.email}</p></div><div className="flex flex-wrap gap-2"><span className="rounded-full bg-petroleum-50 px-3 py-1 text-xs font-semibold text-petroleum-800">{roleLabels[invite.role] || invite.role}</span><span className={`rounded-full px-3 py-1 text-xs font-semibold ${invite.accepted_at ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>{invite.accepted_at ? "Accepterad" : "Väntar"}</span></div></div></article>)}</div>}
    </Panel> : null}
  </div>;
}
