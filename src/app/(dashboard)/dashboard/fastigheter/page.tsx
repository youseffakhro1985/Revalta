import { ModulePlaceholder } from "@/components/module-placeholder";

export default function FastigheterPage() {
  return (
    <ModulePlaceholder
      title="Fastighetsregister"
      description="Här byggs fastighetsregistret vidare med fastighetsbeteckning, adress, ansvarig förvaltare, status, taggar och kopplade ärenden."
      items={[
        "Skapa och redigera fastigheter",
        "Filtrera på status, stad och ansvarig",
        "Tenant-scope och audit logs för varje ändring",
      ]}
    />
  );
}
