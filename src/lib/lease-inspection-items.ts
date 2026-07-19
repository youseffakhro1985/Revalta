export const inspectionConditions = ["approved", "remark", "action_required", "not_inspected"] as const;
export const inspectionPriorities = ["low", "normal", "high", "urgent"] as const;

export type InspectionCondition = (typeof inspectionConditions)[number];
export type InspectionPriority = (typeof inspectionPriorities)[number];

export type LeaseInspectionItem = {
  id: string;
  area: string;
  component: string;
  condition: InspectionCondition;
  priority: InspectionPriority;
  description: string;
  recommendation: string;
  selectedForWorkOrder: boolean;
  resolved: boolean;
};

export type LeaseInspectionRecord = {
  version: number;
  items: LeaseInspectionItem[];
  updatedAt: string;
  updatedBy: { id: string; name: string | null; email: string };
};

type Actor = LeaseInspectionRecord["updatedBy"];

export function emptyInspectionRecord(actor: Actor): LeaseInspectionRecord {
  return { version: 1, items: [], updatedAt: new Date().toISOString(), updatedBy: actor };
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function parseInspectionRecord(input: unknown, previous: LeaseInspectionRecord, actor: Actor) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Ogiltigt underlag", status: 400 } as const;
  const body = input as Record<string, unknown>;
  if (body.version !== undefined && Number(body.version) !== previous.version) {
    return { error: "Besiktningen har ändrats av någon annan. Ladda om och försök igen.", status: 409 } as const;
  }
  if (!Array.isArray(body.items)) return { error: "Besiktningspunkter saknas", status: 400 } as const;
  if (body.items.length > 200) return { error: "Högst 200 besiktningspunkter kan registreras per avtal", status: 400 } as const;

  const ids = new Set<string>();
  const items: LeaseInspectionItem[] = [];
  for (const raw of body.items) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "En besiktningspunkt är ogiltig", status: 400 } as const;
    const item = raw as Record<string, unknown>;
    const id = text(item.id, 80) || crypto.randomUUID();
    const area = text(item.area, 120);
    const component = text(item.component, 120);
    const condition = inspectionConditions.includes(item.condition as InspectionCondition) ? item.condition as InspectionCondition : "not_inspected";
    const priority = inspectionPriorities.includes(item.priority as InspectionPriority) ? item.priority as InspectionPriority : "normal";
    const description = text(item.description, 3000);
    const recommendation = text(item.recommendation, 3000);
    if (ids.has(id)) return { error: "Besiktningspunkterna innehåller dubbla identifierare", status: 400 } as const;
    if (!area || !component) return { error: "Varje besiktningspunkt måste ha rum/område och byggnadsdel", status: 400 } as const;
    if ((condition === "remark" || condition === "action_required") && !description) {
      return { error: `Beskriv anmärkningen för ${area} – ${component}`, status: 400 } as const;
    }
    ids.add(id);
    items.push({
      id,
      area,
      component,
      condition,
      priority,
      description,
      recommendation,
      selectedForWorkOrder: item.selectedForWorkOrder === true && condition === "action_required",
      resolved: item.resolved === true,
    });
  }

  return { data: { version: previous.version + 1, items, updatedAt: new Date().toISOString(), updatedBy: actor } satisfies LeaseInspectionRecord } as const;
}
