"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type TeamMember = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  status: string;
  created_at: string;
  _count: { assigned_tickets: number };
};

type TeamInvite = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
};

const roleLabels: Record<string, string> = {
  owner: "Ägare",
  admin: "Admin",
  manager: "Förvaltare",
  technician: "Tekniker",
  viewer: "Läsbehörig",
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

  useEffect(() => {
    let isMounted = true;

    async function loadTeam() {
      try {
        const [response, invitesResponse] = await Promise.all([
          fetch("/api/team", { cache: "no-store" }),
          fetch("/api/team/invites", { cache: "no-store" }),
        ]);
        if (response.status === 401 || invitesResponse.status === 401) {
          router.push("/login");
          return;
        }

        const [data, invitesData] = await Promise.all([response.json(), invitesResponse.json()]);
        if (!isMounted) return;

        if (!response.ok) {
          setError(data.error || "Kunde inte hämta teamet");
          return;
        }

        setMembers(data.members || []);
        setCompanyName(data.company?.name || "Organisation");
        setCanManage(Boolean(data.canManage));
        if (invitesResponse.ok) setInvites(invitesData.invites || []);
      } catch {
        if (isMounted) setError("Kunde inte kontakta servern");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadTeam();

    return () => {
      isMounted = false;
    };
  }, [router]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);

    try {
      const response = await fetch("/api/team/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, role }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Kunde inte skapa teammedlem");
        return;
      }

      setInvites((current) => [data.invite, ...current]);
      setInviteUrl(data.inviteUrl || "");
      setName("");
      setEmail("");
      setRole("technician");
      setSuccess("Inbjudan är skapad och redo att skickas.");
    } catch {
      setError("Kunde inte kontakta servern");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl animate-fade-in space-y-8">
      <div className="overflow-hidden rounded-2xl border border-sand-200 bg-white text-ink-950 shadow-card-lg">
        <div className="p-8 sm:p-10">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-petroleum-700">Team & behörigheter</p>
          <h1 className="text-4xl font-semibold tracking-tight">{companyName}</h1>
          <p className="mt-3 max-w-2xl text-ink-500">
            Hantera roller, ansvar och åtkomst för hela förvaltningsorganisationen.
          </p>
        </div>
      </div>

      {(error || success) && (
        <div className={`rounded-2xl border p-4 text-sm font-medium ${error ? "border-danger-500 bg-danger-50 text-danger-600" : "border-success-500 bg-success-50 text-success-600"}`}>
          {error || success}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <section className="rounded-2xl border border-sand-200 bg-white p-8 shadow-card">
          <h2 className="text-2xl font-bold text-ink-950">Bjud in teammedlem</h2>
          <p className="mt-2 text-sm text-ink-500">Skapa en säker inbjudningslänk. Med e-postleverantör skickas länken automatiskt.</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <fieldset disabled={!canManage} className="space-y-5 disabled:opacity-60">
              <div>
                <label className="mb-1 block text-sm font-medium text-ink-700">Namn</label>
                <input className="block w-full rounded-xl border border-sand-200 p-3 shadow-inner-sm outline-none focus:border-petroleum-500" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex. Sara Tekniker" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink-700">E-post</label>
                <input type="email" required className="block w-full rounded-xl border border-sand-200 p-3 shadow-inner-sm outline-none focus:border-petroleum-500" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="sara@exempel.se" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink-700">Roll</label>
                <select className="block w-full rounded-xl border border-sand-200 bg-white p-3 shadow-inner-sm outline-none focus:border-petroleum-500" value={role} onChange={(event) => setRole(event.target.value)}>
                  <option value="admin">Admin</option>
                  <option value="manager">Förvaltare</option>
                  <option value="technician">Tekniker</option>
                  <option value="viewer">Läsbehörig</option>
                </select>
              </div>
              <button disabled={submitting || !canManage} className="w-full rounded-xl bg-petroleum-600 px-8 py-3 font-semibold text-white shadow-card transition-all hover:bg-petroleum-700 disabled:cursor-not-allowed disabled:opacity-70">
                {submitting ? "Skapar..." : "Skapa inbjudan"}
              </button>
            </fieldset>
          </form>
          {inviteUrl && (
            <div className="mt-5 rounded-2xl border border-petroleum-100 bg-petroleum-50 p-4">
              <p className="text-sm font-bold text-petroleum-700">Inbjudningslänk</p>
              <p className="mt-2 break-all text-sm text-petroleum-700">{inviteUrl}</p>
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-card">
          <div className="border-b border-sand-100 bg-sand-50/70 p-6">
            <h2 className="text-lg font-bold text-ink-950">Team</h2>
            <p className="mt-1 text-sm text-ink-500">Roller och antal tilldelade ärenden.</p>
          </div>
          {loading ? (
            <div className="space-y-4 p-6">
              {[1, 2, 3].map((item) => <div key={item} className="h-20 animate-pulse rounded-2xl bg-sand-100" />)}
            </div>
          ) : (
            <div className="divide-y divide-sand-100">
              {members.map((member) => (
                <article key={member.id} className="p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-ink-950">{member.name || member.email}</h3>
                      <p className="mt-1 text-sm text-ink-500">{member.email}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full border border-petroleum-100 bg-petroleum-50 px-3 py-1 text-xs font-bold text-petroleum-600">{roleLabels[member.role] || member.role}</span>
                      <span className="rounded-full border border-sand-200 bg-sand-50 px-3 py-1 text-xs font-bold text-ink-600">{member._count.assigned_tickets} tilldelade</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-card">
        <div className="border-b border-sand-100 bg-sand-50/70 p-6">
          <h2 className="text-lg font-bold text-ink-950">Senaste inbjudningar</h2>
          <p className="mt-1 text-sm text-ink-500">Säkra länkar som kan accepteras av nya teammedlemmar.</p>
        </div>
        <div className="divide-y divide-sand-100">
          {invites.length > 0 ? invites.map((invite) => (
            <article key={invite.id} className="p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-bold text-ink-950">{invite.name || invite.email}</h3>
                  <p className="mt-1 text-sm text-ink-500">{invite.email}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-petroleum-100 bg-petroleum-50 px-3 py-1 text-xs font-bold text-petroleum-600">{roleLabels[invite.role] || invite.role}</span>
                  <span className={`rounded-full border px-3 py-1 text-xs font-bold ${invite.accepted_at ? "border-success-500 bg-success-50 text-success-600" : "border-warning-500 bg-warning-50 text-warning-600"}`}>
                    {invite.accepted_at ? "Accepterad" : "Väntar"}
                  </span>
                </div>
              </div>
            </article>
          )) : (
            <div className="p-8 text-sm text-ink-500">Inga inbjudningar ännu.</div>
          )}
        </div>
      </section>
    </div>
  );
}
