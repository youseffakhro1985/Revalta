import { MarketingPage } from "@/components/marketing-page";

export default function GlomtLosenordPage() {
  return (
    <MarketingPage
      eyebrow="Återställning"
      title="Återställ lösenord"
      description="Här kommer ett säkert återställningsflöde med engångslänk och audit loggning. För MVP finns sidan på plats i rätt svensk route."
      bullets={["Säker återställningslänk", "Sessionsskydd", "Audit log vid lösenordsbyte", "Professionell svensk e-postmall"]}
    />
  );
}
