import { MarketingPage } from "@/components/marketing-page";

export default function PrivacyPage() {
  return (
    <MarketingPage
      eyebrow="Juridik"
      title="Integritetspolicy"
      description="Revalta byggs för säker hantering av företagsdata, användaruppgifter och fastighetsrelaterad information."
      bullets={[
        "Tenant-isolerad data per företag",
        "Säkra sessioner och server-side accesskontroll",
        "Audit logs för viktiga händelser",
        "Datamodeller för soft delete och framtida retention policies",
      ]}
    />
  );
}
