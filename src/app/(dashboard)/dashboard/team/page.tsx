import { ModulePlaceholder } from "@/components/module-placeholder";

export default function TeamPage() {
  return (
    <ModulePlaceholder
      eyebrow="Team"
      title="Team och roller"
      description="Bjud in användare, styr roller och koppla behörigheter till företagets operativa flöden."
      items={["Rollbaserad accesskontroll", "Inbjudningar", "Blockering och borttagning"]}
    />
  );
}
