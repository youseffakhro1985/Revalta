import { ModulePlaceholder } from "@/components/module-placeholder";

export default function InstallningarPage() {
  return (
    <ModulePlaceholder
      eyebrow="Inställningar"
      title="Företagsinställningar"
      description="Profil, kontaktuppgifter, notifieringar och säkerhetspolicyer samlas här i nästa iteration."
      items={["Företagsprofil", "Notifieringsval", "Säkerhetsinställningar", "Abonnemangsöversikt"]}
    />
  );
}
