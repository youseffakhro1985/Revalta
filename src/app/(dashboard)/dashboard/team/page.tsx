import { ModulePlaceholder } from "@/components/module-placeholder";

export default function TeamPage() {
  return (
    <ModulePlaceholder
      title="Team och roller"
      description="Bjud in användare, styr roller och koppla behörigheter till företagets operativa flöden."
      bullets={["Rollbaserad accesskontroll", "Inbjudningar", "Blockering och borttagning"]}
    />
  );
}
