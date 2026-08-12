type TicketAnalysis = {
  category: string;
  priority: string;
  confidence: number;
  summary: string;
  recommendedAction: string;
};

function deterministicAnalysis(description: string): TicketAnalysis {
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

// Denna fil hanterar AI-logik för felanmälningar. Om AI_PROVIDER_API_KEY finns
// används en OpenAI-kompatibel API-endpoint, annars används en deterministisk svensk fallback.
export async function analyzeTicket(description: string): Promise<TicketAnalysis> {
  if (!process.env.AI_PROVIDER_API_KEY) {
    return deterministicAnalysis(description);
  }

  try {
    const response = await fetch(process.env.AI_PROVIDER_API_URL || "https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.AI_PROVIDER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.AI_PROVIDER_MODEL || "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Du är en svensk fastighetsförvaltningsassistent. Svara endast med JSON: category, priority, confidence, summary, recommendedAction. category ska vara one of vvs,electricity,elevator,security,cleaning,other. priority ska vara low,normal,high,urgent.",
          },
          { role: "user", content: description },
        ],
      }),
      // Matches the fail-fast pattern used by the other outbound integrations
      // (email/SMS: 12s, invoice export: 20s) — without this, a slow or hanging
      // AI provider could stall the request well past typical serverless limits
      // instead of falling back to the deterministic analysis below.
      signal: AbortSignal.timeout(15_000),
    });
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!response.ok || typeof content !== "string") {
      return deterministicAnalysis(description);
    }

    const parsed = JSON.parse(content) as Partial<TicketAnalysis>;
    return {
      category: parsed.category || deterministicAnalysis(description).category,
      priority: parsed.priority || deterministicAnalysis(description).priority,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.72,
      summary: parsed.summary || deterministicAnalysis(description).summary,
      recommendedAction: parsed.recommendedAction || deterministicAnalysis(description).recommendedAction,
    };
  } catch {
    return deterministicAnalysis(description);
  }
}
