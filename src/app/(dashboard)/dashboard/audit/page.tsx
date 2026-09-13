import { PageHeader } from "@/components/dashboard/premium-ui";
import { AuditLogCenter } from "@/components/settings/audit-log-center";

export default function AuditPage() {
  return (
    <div className="mx-auto max-w-6xl animate-fade-in space-y-6">
      <PageHeader
        catalog="audit"
        eyebrow="Administration · Spårbarhet"
        title="Spårbarhet och kontroll"
        description="Granska viktiga förändringar i organisationen med tydliga filter, ansvarig användare och teknisk händelsedata. Loggen är tenant-isolerad och endast tillgänglig för ägare och administratörer."
      />

      <AuditLogCenter />
    </div>
  );
}
