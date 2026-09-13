import { PRIORITIES } from "@/lib/domain-labels";

const TICKET_CATEGORY_OPTIONS = ["vvs", "electricity", "elevator", "security", "cleaning", "other"] as const;

export type AiSource = "provider" | "fallback" | "staff";

export type TicketAnalysis = {
  category: string;
  priority: string;
  confidence: number;
  summary: string;
  recommendedAction: string;
  source: AiSource;
};

export type DocumentAnalysis = {
  category: string;
  confidence: number;
  summary: string;
  source: AiSource;
};

export const WORK_ORDER_DOCUMENT_CATEGORIES = [
  "before",
  "after",
  "invoice",
  "warranty",
  "manual",
  "report",
  "other",
] as const;

export const LIBRARY_DOCUMENT_CATEGORIES = [
  "contract",
  "invoice",
  "protocol",
  "drawing",
  "insurance",
  "energy",
  "inspection",
  "other",
] as const;

export type WorkOrderDocumentCategory = (typeof WORK_ORDER_DOCUMENT_CATEGORIES)[number];
export type LibraryDocumentCategory = (typeof LIBRARY_DOCUMENT_CATEGORIES)[number];

const TEXT_SNIPPET_MAX = 2_000;

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
    source: "fallback",
  };
}

function pickAllowed(value: unknown, allowed: readonly string[], fallback: string) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return allowed.includes(normalized) ? normalized : fallback;
}

function providerRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function boundedConfidence(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback;
}

function boundedText(value: unknown, fallback: string, maxLength: number) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : fallback;
}

function mapToAllowed(category: string, allowed: readonly string[]): string | null {
  if (allowed.includes(category)) return category;
  if (category === "protocol" && allowed.includes("report")) return "report";
  if (category === "contract" && allowed.includes("manual")) return "manual";
  if (category === "inspection" && allowed.includes("report")) return "report";
  return null;
}

function deterministicDocumentCategory(haystack: string, allowed: readonly string[]): string {
  const text = haystack.toLowerCase();
  const candidates = [
    [/(faktura|invoice|kvitto)/, "invoice"],
    [/(garanti|warranty)/, "warranty"],
    [/(manual|instruktion|skötsel|skotsel)/, "manual"],
    [/(före|fore|before|innan\s*åtgärd|innan\s*atgard)/, "before"],
    [/(efter|after|slutbesikt)/, "after"],
    [/(protokoll|protocol)/, "protocol"],
    [/(rapport|report)/, "report"],
    [/(avtal|contract|hyreskontrakt)/, "contract"],
    [/(ritning|drawing|planritning)/, "drawing"],
    [/(försäkring|forsakring|insurance)/, "insurance"],
    [/(energi|oib|energideklaration)/, "energy"],
    [/(besiktning|inspection)/, "inspection"],
  ] as const;

  for (const [pattern, category] of candidates) {
    if (!pattern.test(text)) continue;
    const mapped = mapToAllowed(category, allowed);
    if (mapped) return mapped;
  }
  return "other";
}

/** Extract a short UTF-8 snippet from text-like files. Never returns raw binary. */
export function documentTextSnippet(bytes: Buffer, contentType: string): string {
  const type = contentType.toLowerCase();
  const isText =
    type.startsWith("text/")
    || type.includes("json")
    || type.includes("xml")
    || type.includes("csv")
    || type === "application/rtf";
  if (!isText) return "";
  const sample = bytes.subarray(0, TEXT_SNIPPET_MAX);
  if (sample.includes(0)) return "";
  return sample.toString("utf8").replace(/\u0000/g, "").slice(0, TEXT_SNIPPET_MAX);
}

function deterministicDocumentAnalysis(
  fileName: string,
  textSnippet: string,
  allowed: readonly string[],
): DocumentAnalysis {
  const category = deterministicDocumentCategory(`${fileName}\n${textSnippet}`, allowed);
  return {
    category,
    confidence: category === "other" ? 0.52 : 0.84,
    summary: fileName.slice(0, 180),
    source: "fallback",
  };
}

// Denna fil hanterar AI-logik för felanmälningar. Om AI_PROVIDER_API_KEY finns
// används en OpenAI-kompatibel API-endpoint, annars används en deterministisk svensk fallback.
export async function analyzeTicket(description: string): Promise<TicketAnalysis> {
  const fallback = deterministicAnalysis(description);
  if (!process.env.AI_PROVIDER_API_KEY) {
    return fallback;
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
              `Du är en svensk fastighetsförvaltningsassistent. Svara endast med JSON: category, priority, confidence, summary, recommendedAction. category ska vara one of ${TICKET_CATEGORY_OPTIONS.join(",")}. priority ska vara ${PRIORITIES.join(",")}.`,
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
      return fallback;
    }

    const parsed = providerRecord(JSON.parse(content));
    if (!parsed) return fallback;
    const category = pickAllowed(parsed.category, TICKET_CATEGORY_OPTIONS, "");
    const priority = pickAllowed(parsed.priority, PRIORITIES, "");
    if (!category || !priority) return fallback;
    return {
      category,
      priority,
      confidence: boundedConfidence(parsed.confidence, fallback.confidence),
      summary: boundedText(parsed.summary, fallback.summary, 500),
      recommendedAction: boundedText(parsed.recommendedAction, fallback.recommendedAction, 1_000),
      source: "provider",
    };
  } catch {
    return fallback;
  }
}

export async function analyzeDocument(input: {
  fileName: string;
  textSnippet?: string;
  allowedCategories: readonly string[];
  existingCategory?: string;
}): Promise<DocumentAnalysis> {
  const allowed = input.allowedCategories.length > 0 ? input.allowedCategories : ["other"];
  const existing = pickAllowed(input.existingCategory, allowed, "");
  if (existing && existing !== "other") {
    return { category: existing, confidence: 1, summary: input.fileName.slice(0, 180), source: "staff" };
  }

  const fallback = deterministicDocumentAnalysis(input.fileName, input.textSnippet || "", allowed);
  if (!process.env.AI_PROVIDER_API_KEY) {
    return fallback;
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
              `Du klassificerar fastighetsdokument. Svara endast med JSON: category, confidence, summary. category ska vara one of ${allowed.join(",")}. Använd endast filnamn och eventuell textsnutt — aldrig binärt innehåll.`,
          },
          {
            role: "user",
            content: JSON.stringify({
              fileName: input.fileName,
              textSnippet: (input.textSnippet || "").slice(0, TEXT_SNIPPET_MAX),
            }),
          },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!response.ok || typeof content !== "string") {
      return fallback;
    }
    const parsed = providerRecord(JSON.parse(content));
    if (!parsed) return fallback;
    const category = pickAllowed(parsed.category, allowed, "");
    if (!category) return fallback;
    return {
      category,
      confidence: boundedConfidence(parsed.confidence, fallback.confidence),
      summary: boundedText(parsed.summary, fallback.summary, 500),
      source: "provider",
    };
  } catch {
    return fallback;
  }
}
