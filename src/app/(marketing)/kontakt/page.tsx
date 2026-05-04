import { MarketingPage } from "@/components/marketing-page";

export default function KontaktPage() {
  return (
    <MarketingPage
      eyebrow="Kontakt"
      title="Prata med Revalta"
      description="Berätta om ert bestånd, era flöden och vilka delar av fastighetsförvaltningen ni vill digitalisera först."
      bullets={["Demo och införande", "BRF och fastighetsbolag", "Partners och förvaltare"]}
    />
  );
}
