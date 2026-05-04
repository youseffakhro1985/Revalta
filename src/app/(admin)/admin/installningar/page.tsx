import { ModulePlaceholder } from "@/components/module-placeholder";

export default function AdminSettingsPage() {
  return (
    <ModulePlaceholder
      eyebrow="Admin"
      title="Systeminställningar"
      description="Grund för plattformsinställningar, feature toggles, SMS/e-postkonfiguration och AI-policyer."
      items={["Feature toggles", "Notisinställningar", "Säkerhetspolicyer"]}
    />
  );
}
