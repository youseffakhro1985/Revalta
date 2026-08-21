export const INSPECTION_CHECKLIST_CATEGORIES = [
  "general",
  "daily",
  "technical",
  "fire_safety",
  "ventilation",
  "outdoor",
  "playground",
  "security",
] as const;

export const INSPECTION_CHECKLIST_CATEGORY_LABELS: Record<string, string> = {
  general: "Allmän tillsyn",
  daily: "Daglig tillsyn",
  technical: "Teknisk kontroll",
  fire_safety: "Brandskydd",
  ventilation: "Ventilation / OVK",
  outdoor: "Utemiljö",
  playground: "Lekplats",
  security: "Säkerhet",
};

export function normalizeInspectionTemplateItems(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const unique = new Set<string>();
  for (const value of raw) {
    const label = typeof value === "string"
      ? value.trim().slice(0, 200)
      : value && typeof value === "object" && typeof (value as Record<string, unknown>).label === "string"
        ? String((value as Record<string, unknown>).label).trim().slice(0, 200)
        : "";
    if (!label) continue;
    unique.add(label);
    if (unique.size >= 100) break;
  }
  return [...unique];
}

export function parseInspectionTemplatePayload(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { error: "Ogiltigt underlag", status: 400 } as const;
  }
  const body = input as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const category = typeof body.category === "string" ? body.category.trim() : "general";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const items = normalizeInspectionTemplateItems(body.items);

  if (!name || name.length > 160) {
    return { error: "Namn krävs och får vara max 160 tecken", status: 400 } as const;
  }
  if (!INSPECTION_CHECKLIST_CATEGORIES.includes(category as (typeof INSPECTION_CHECKLIST_CATEGORIES)[number])) {
    return { error: "Ogiltig checklistkategori", status: 400 } as const;
  }
  if (description.length > 600) {
    return { error: "Beskrivningen får vara max 600 tecken", status: 400 } as const;
  }
  if (items.length === 0) {
    return { error: "Minst en kontrollpunkt krävs", status: 400 } as const;
  }

  return { data: { name, category, description, items } } as const;
}
