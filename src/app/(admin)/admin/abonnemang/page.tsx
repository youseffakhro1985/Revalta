import { ModulePlaceholder } from "@/components/module-placeholder";

export default function AdminSubscriptionsPage() {
  return (
    <ModulePlaceholder
      eyebrow="Admin"
      title="Abonnemang"
      description="Översikt för planer, trials och kommande feature gating per kund."
      items={["Start", "Professional", "Enterprise"]}
    />
  );
}
