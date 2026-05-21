"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type AuditLog = {
  id: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  actor: {
    name: string | null;
    email: string;
  } | null;
};

const dateFormatter = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default function AuditPage() {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;

    async function loadAudit() {
      try {
        const response = await fetch("/api/audit", { cache: "no-store" });
        if (response.status === 401) {
          router.push("/login");
          return;
        }
        const data = await response.json();
        if (!isMounted) return;
        if (!response.ok) {
          setError(data.error || "Kunde inte hämta audit log");
          return;
        }
        setAuditLogs(data.auditLogs || []);
      } catch {
        if (isMounted) setError("Kunde inte kontakta servern");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadAudit();

    return () => {
      isMounted = false;
    };
  }, [router]);

  return (
    <div className="mx-auto max-w-6xl animate-fade-in space-y-8">
      <header className="rounded-3xl border border-slate-200 bg-white p-8 shadow-card">
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">Audit log</p>
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-950">Spårbarhet och kontroll</h1>
        <p className="mt-3 max-w-2xl text-slate-600">
          Följ teamets viktigaste händelser: skapade fastigheter, ärenden, statusändringar, kommentarer och teamförändringar.
        </p>
      </header>

      {error && <div className="rounded-2xl border border-danger-500 bg-danger-50 p-4 text-sm font-medium text-danger-600">{error}</div>}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
        <div className="border-b border-slate-100 bg-slate-50/70 p-6">
          <h2 className="text-lg font-bold text-slate-950">Senaste händelser</h2>
        </div>
        {loading ? (
          <div className="space-y-4 p-6">
            {[1, 2, 3].map((item) => <div key={item} className="h-20 animate-pulse rounded-2xl bg-slate-100" />)}
          </div>
        ) : auditLogs.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {auditLogs.map((log) => (
              <article key={log.id} className="p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-slate-950">{log.action}</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {log.entity_type}
                      {log.entity_id ? ` #${log.entity_id.slice(0, 8)}` : ""} · {log.actor?.name || log.actor?.email || "System"}
                    </p>
                    {log.metadata && (
                      <p className="mt-3 max-w-3xl rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">
                        {JSON.stringify(log.metadata)}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-500">
                    {dateFormatter.format(new Date(log.created_at))}
                  </span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="p-12 text-center text-sm text-slate-500">Inga händelser ännu.</div>
        )}
      </section>
    </div>
  );
}
