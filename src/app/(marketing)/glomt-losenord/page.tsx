import { MarketingPage } from "@/components/marketing-page";

export default function ForgotPasswordPage() {
  return (
    <MarketingPage
      eyebrow="Återställ lösenord"
      title="Säker återställning kommer i nästa härdningssteg."
      description="Auth-grunden är byggd med säkra cookies och hashade lösenord. Den här sidan markerar flödet för kommande tokenbaserad återställning."
    />
  );
}
