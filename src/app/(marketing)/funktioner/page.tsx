import { MarketingPage } from "@/components/marketing-page";

export default function FunktionerPage() {
  return (
    <MarketingPage
      eyebrow="Funktioner"
      title="Allt från felanmälan till AI-beslutsstöd."
      description="Revalta samlar ärenden, fastigheter, dokument, team och insikter i ett modernt SaaS-gränssnitt för fastighetsförvaltning."
      bullets={["AI-analys av felanmälningar", "Skyddad företagsdashboard", "Audit logs och rollbaserad åtkomst"]}
    />
  );
}
