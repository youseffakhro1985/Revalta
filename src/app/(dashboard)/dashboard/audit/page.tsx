import { AuditLogCenter } from "@/components/settings/audit-log-center";

export default function AuditPage() {
  return (
    <div className="mx-auto max-w-6xl animate-fade-in space-y-6">
      <header className="rounded-2xl border border-sand-200 bg-white p-7 shadow-premium-sm sm:p-8">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-petroleum-600">
          Administration
        </p>
        <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.035em] text-ink-950 sm:text-[36px]">
          Spårbarhet och kontroll
        </h1>
        <p className="mt-3 max-w-3xl text-ink-600">
          Granska viktiga förändringar i organisationen med tydliga filter, ansvarig användare och teknisk händelsedata.
          Loggen är tenant-isolerad och endast tillgänglig för ägare och administratörer.
        </p>
      </header>

      <AuditLogCenter />
    </div>
  );
}
