import { MarketingPage } from "@/components/marketing-page";

export default function PricingPage() {
  return (
    <MarketingPage
      eyebrow="Priser"
      title="Planer för växande fastighetsorganisationer."
      description="Start, Professional och Enterprise är förberedda i datamodellen så Revalta kan växa från MVP till full SaaS."
      bullets={["Start för första workspace", "Professional med AI-insikter", "Enterprise med avancerad kontroll"]}
    />
  );
}
