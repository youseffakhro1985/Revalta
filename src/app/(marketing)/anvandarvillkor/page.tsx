import { MarketingPage } from "@/components/marketing-page";

export default function TermsPage() {
  return (
    <MarketingPage
      eyebrow="Villkor"
      title="Användarvillkor"
      description="Villkorsgrunden för Revaltas SaaS-plattform med fokus på ansvarsfull användning, säkerhet och åtkomst."
      bullets={["Konto och behörighet", "Tjänstens användning", "Ansvar och begränsningar"]}
    />
  );
}
