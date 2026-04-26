export type TicketAiResult = {
  category: string;
  priority: string;
  riskLevel: string;
  riskScore: number;
  summary: string;
  recommendedAction: string;
  replyDraft: string;
  confidence: number;
};

export function analyzeTicketText(title: string, description: string): TicketAiResult {
  const text = `${title} ${description}`.toLowerCase();

  const highRiskWords = [
    "läckage",
    "vatten",
    "översvämning",
    "brand",
    "rök",
    "gnistor",
    "strömlöst",
    "inbrott",
    "mögel",
    "avlopp",
    "luktar bränt",
  ];

  const hasHighRisk = highRiskWords.some((word) => text.includes(word));

  let category = "other";
  if (text.includes("vatten") || text.includes("läckage") || text.includes("avlopp")) category = "vvs";
  if (text.includes("el") || text.includes("ström") || text.includes("lampa")) category = "el";
  if (text.includes("ventilation") || text.includes("luft")) category = "ventilation";
  if (text.includes("lås") || text.includes("port") || text.includes("passage")) category = "locks_access";

  const priority = hasHighRisk ? "high" : "normal";
  const riskScore = hasHighRisk ? 82 : 35;
  const riskLevel = hasHighRisk ? "hög" : "låg";

  return {
    category,
    priority,
    riskLevel,
    riskScore,
    summary: `Ärendet gäller ${title.toLowerCase()} och bör hanteras enligt vald prioritet.`,
    recommendedAction: hasHighRisk
      ? "Manuell bedömning bör göras skyndsamt av ansvarig förvaltare."
      : "Planera normal handläggning och följ upp vid behov.",
    replyDraft:
      "Tack för din felanmälan. Ärendet är mottaget och kommer att bedömas av ansvarig förvaltare.",
    confidence: hasHighRisk ? 0.86 : 0.68,
  };
}
