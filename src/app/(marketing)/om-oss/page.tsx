import { MarketingPage } from "@/components/marketing-page";

export default function OmOssPage() {
  return (
    <MarketingPage
      eyebrow="Om oss"
      title="Byggd för nordisk fastighetsförvaltning"
      description="Revalta kombinerar operativ förvaltning, tydliga processer och AI-beslutsstöd i en modern SaaS-plattform."
      items={["Svensk tonalitet", "Premium B2B-design", "Skalbar produktarkitektur"]}
    />
  );
}
