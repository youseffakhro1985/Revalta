// Denna fil hanterar AI-logik för felanmälningar. I devläge används en deterministisk analys
// så flödet är fullt testbart även utan extern AI-nyckel.
export async function analyzeTicket(description: string) {
  const text = description.toLowerCase();
  const isUrgent = /(akut|läcka|vatten|brand|hiss|el|ström|inbrott|risk)/.test(text);
  const isVvs = /(vatten|läcka|kran|avlopp|toalett|rör)/.test(text);
  const isElectricity = /(el|ström|lampa|belysning|säkring)/.test(text);
  const isElevator = /(hiss|lift)/.test(text);
  const isSecurity = /(lås|port|inbrott|säkerhet|tagg)/.test(text);

  const category = isVvs
    ? "vvs"
    : isElectricity
      ? "electricity"
      : isElevator
        ? "elevator"
        : isSecurity
          ? "security"
          : "other";
  const priority = isUrgent ? "urgent" : text.length > 180 ? "high" : "normal";

  return {
    category,
    priority,
    confidence: isUrgent || category !== "other" ? 0.86 : 0.62,
    summary: description.length > 140 ? `${description.slice(0, 137)}...` : description,
    recommendedAction:
      priority === "urgent"
        ? "Prioritera ärendet omgående och tilldela ansvarig tekniker."
        : "Planera åtgärd och återkoppla till kund med nästa steg.",
  };
}
