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

const roleLabels: Record<string, string> = {
  owner: "Ägare",
  admin: "Admin",
  manager: "Förvaltare",
  technician: "Tekniker",
  viewer: "Läsbehörig",
};

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [companyName, setCompanyName] = useState("Organisation");
  const [canManage, setCanManage] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("technician");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;

    async function loadTeam() {
      try {
        const response = await fetch("/api/team", { cache: "no-store" });
        if (response.status === 401) {
          router.push("/login");
          return;
        }

        const data = await response.json();
        if (!isMounted) return;

        if (!response.ok) {
          setError(data.error || "Kunde inte hämta teamet");
          return;
        }

        setMembers(data.members || []);
        setCompanyName(data.company?.name || "Organisation");
        setCanManage(Boolean(data.canManage));
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
      const response = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, role, password }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Kunde inte skapa teammedlem");
        return;
      }

      setMembers((current) => [...current, data.member]);
      setName("");
      setEmail("");
      setRole("technician");
      setPassword("");
      setSuccess("Teammedlemmen är skapad och kan nu tilldelas ärenden.");
    } catch {
      setError("Kunde inte kontakta servern");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl animate-fade-in space-y-8">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-950 text-white shadow-card-lg">
        <div className="bg-[radial-gradient(circle_at_top_right,_rgba(97,114,243,0.35),_transparent_35%)] p-8 sm:p-10">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-brand-200">Team & behörigheter</p>
          <h1 className="text-4xl font-extrabold tracking-tight">{companyName}</h1>
          <p className="mt-3 max-w-2xl text-slate-300">
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
        <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-card">
          <h2 className="text-2xl font-bold text-slate-950">Bjud in teammedlem</h2>
          <p className="mt-2 text-sm text-slate-500">Skapa en användare med roll och lösenord för testbar åtkomst direkt.</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <fieldset disabled={!canManage} className="space-y-5 disabled:opacity-60">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Namn</label>
                <input className="block w-full rounded-xl border border-slate-200 p-3 shadow-inner-sm outline-none focus:border-brand-500" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex. Sara Tekniker" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">E-post</label>
                <input type="email" required className="block w-full rounded-xl border border-slate-200 p-3 shadow-inner-sm outline-none focus:border-brand-500" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="sara@exempel.se" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Roll</label>
                <select className="block w-full rounded-xl border border-slate-200 bg-white p-3 shadow-inner-sm outline-none focus:border-brand-500" value={role} onChange={(event) => setRole(event.target.value)}>
                  <option value="admin">Admin</option>
                  <option value="manager">Förvaltare</option>
                  <option value="technician">Tekniker</option>
                  <option value="viewer">Läsbehörig</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Tillfälligt lösenord</label>
                <input type="password" required minLength={6} className="block w-full rounded-xl border border-slate-200 p-3 shadow-inner-sm outline-none focus:border-brand-500" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Minst 6 tecken" />
              </div>
              <button disabled={submitting || !canManage} className="w-full rounded-xl bg-brand-600 px-8 py-3 font-semibold text-white shadow-card transition-all hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-70">
                {submitting ? "Skapar..." : "Skapa teammedlem"}
              </button>
            </fieldset>
          </form>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
          <div className="border-b border-slate-100 bg-slate-50/70 p-6">
            <h2 className="text-lg font-bold text-slate-950">Team</h2>
            <p className="mt-1 text-sm text-slate-500">Roller och antal tilldelade ärenden.</p>
          </div>
          {loading ? (
            <div className="space-y-4 p-6">
              {[1, 2, 3].map((item) => <div key={item} className="h-20 animate-pulse rounded-2xl bg-slate-100" />)}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {members.map((member) => (
                <article key={member.id} className="p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-slate-950">{member.name || member.email}</h3>
                      <p className="mt-1 text-sm text-slate-500">{member.email}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full border border-brand-100 bg-brand-50 px-3 py-1 text-xs font-bold text-brand-600">{roleLabels[member.role] || member.role}</span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">{member._count.assigned_tickets} tilldelade</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
