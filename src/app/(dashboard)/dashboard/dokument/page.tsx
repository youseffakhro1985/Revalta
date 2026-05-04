import { ModulePlaceholder } from "@/components/module-placeholder";

export default function DokumentPage() {
  return (
    <ModulePlaceholder
      title="Dokument"
      description="Samla avtal, protokoll, besiktningar och tekniska dokument per fastighet. Filuppladdning och versionshantering är nästa naturliga steg."
      bullets={["Dokumentlista per företag", "Koppling till fastighet och ärende", "Sök, filter och tydliga empty states"]}
    />
  );
}
