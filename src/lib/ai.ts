export type TicketAnalysis = {
  category: "vvs" | "el" | "ventilation" | "locks_access" | "damage" | "cleaning" | "outdoor" | "laundry" | "elevator" | "security" | "other";
  priority: "low" | "normal" | "high" | "urgent";
  riskLevel: "låg" | "medel" | "hög" | "kritisk";
  riskScore: number;
  summary: string;
  recommendedAction: string;
  replyDraft: string;
  confidence: number;
  needsReview: boolean;
};

const categoryRules: Array<[TicketAnalysis["category"], RegExp]> = [
  ["vvs", /vatten|läck|dropp|avlopp|toa|wc|kran|rör|fukt|mögel|värme|element/i],
  ["el", /el|ström|strömlös|säkring|gnista|uttag|belysning|lampa/i],
  ["ventilation", /ventilation|fläkt|luft|imma|dålig lukt/i],
  ["locks_access", /lås|nyckel|port|passage|tagg|kod|dörr/i],
  ["elevator", /hiss/i],
  ["security", /inbrott|brand|rök|larm|säkerhet/i],
  ["cleaning", /städ|skräp|smuts/i],
  ["outdoor", /gård|utemiljö|snö|is|parkering/i],
  ["laundry", /tvätt|torktumlare|tvättstuga/i],
  ["damage", /skada|spricka|trasig|krossad/i],
];

const riskRules: Array<[RegExp, number]> = [
  [/brand|rök|gnistor|luktar bränt|översvämning/i, 95],
  [/läckage|läcker|vatten|avlopp|mögel|fukt/i, 82],
  [/strömlöst|elfel|ingen värme|inbrott|lås fungerar inte/i, 74],
  [/hiss.*fast|trasig hiss|spricka/i, 62],
];

function getCategory(text: string): TicketAnalysis["category"] {
  return categoryRules.find(([, pattern]) => pattern.test(text))?.[0] ?? "other";
}

function getRiskScore(text: string) {
  const match = riskRules.find(([pattern]) => pattern.test(text));
  return match?.[1] ?? 28;
}

function getPriority(score: number): TicketAnalysis["priority"] {
  if (score >= 90) return "urgent";
  if (score >= 70) return "high";
  if (score >= 45) return "normal";
  return "low";
}

function getRiskLevel(score: number): TicketAnalysis["riskLevel"] {
  if (score >= 90) return "kritisk";
  if (score >= 70) return "hög";
  if (score >= 45) return "medel";
  return "låg";
}

export async function analyzeTicket(title: string, description: string): Promise<TicketAnalysis> {
  const text = `${title} ${description}`.trim();
  const category = getCategory(text);
  const riskScore = getRiskScore(text);
  const priority = getPriority(riskScore);
  const riskLevel = getRiskLevel(riskScore);
  const shortTitle = title.trim().replace(/\.$/, "").toLowerCase();

  return {
    category,
    priority,
    riskLevel,
    riskScore,
    summary: `AI bedömer ärendet som ${shortTitle || "en felanmälan"} med ${riskLevel} risknivå.`,
    recommendedAction:
      riskScore >= 70
        ? "Gör en manuell bedömning skyndsamt och tilldela ansvarig förvaltare."
        : "Bekräfta mottagande, komplettera vid behov och planera nästa åtgärd.",
    replyDraft:
      "Tack för din felanmälan. Ärendet är mottaget och kommer att bedömas av ansvarig förvaltare innan åtgärd planeras.",
    confidence: riskScore >= 70 ? 0.88 : 0.74,
    needsReview: riskScore >= 70,
  };
}
