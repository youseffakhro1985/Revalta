export type RoundChecklistItem = {
  id: string;
  label: string;
  completed: boolean;
  hasDeviation: boolean;
  note: string;
  workOrderId: string | null;
};

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function normalizeChecklist(raw: unknown): RoundChecklistItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item, index) => {
    if (typeof item === "string") {
      const label = item.trim().slice(0, 200);
      if (!label) return [];
      return [{
        id: `item-${index + 1}`,
        label,
        completed: false,
        hasDeviation: false,
        note: "",
        workOrderId: null,
      }];
    }
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const label = text(row.label, 200);
    if (!label) return [];
    return [{
      id: text(row.id, 80) || `item-${index + 1}`,
      label,
      completed: row.completed === true,
      hasDeviation: row.hasDeviation === true,
      note: text(row.note, 1000),
      workOrderId: typeof row.workOrderId === "string" ? row.workOrderId : null,
    }];
  });
}

export function buildChecklistFromLabels(labels: string[]): RoundChecklistItem[] {
  return labels.map((label) => ({
    id: crypto.randomUUID(),
    label: label.slice(0, 200),
    completed: false,
    hasDeviation: false,
    note: "",
    workOrderId: null,
  })).filter((item) => item.label);
}

export function countDeviations(items: RoundChecklistItem[]) {
  return items.filter((item) => item.hasDeviation).length;
}

export function parseChecklistUpdate(input: unknown, previous: RoundChecklistItem[]) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { error: "Ogiltigt underlag", status: 400 } as const;
  }
  const body = input as Record<string, unknown>;
  if (!Array.isArray(body.checklist)) {
    return { error: "Kontrollpunkter saknas", status: 400 } as const;
  }
  if (body.checklist.length !== previous.length) {
    return { error: "Kontrollpunkternas antal får inte ändras här", status: 400 } as const;
  }

  const previousById = new Map(previous.map((item) => [item.id, item]));
  const next: RoundChecklistItem[] = [];
  for (const raw of body.checklist) {
    if (!raw || typeof raw !== "object") return { error: "En kontrollpunkt är ogiltig", status: 400 } as const;
    const row = raw as Record<string, unknown>;
    const id = text(row.id, 80);
    const current = previousById.get(id);
    if (!current) return { error: "Okänd kontrollpunkt", status: 404 } as const;
    const hasDeviation = row.hasDeviation === true;
    next.push({
      id: current.id,
      label: current.label,
      completed: row.completed === true,
      hasDeviation,
      note: hasDeviation ? text(row.note, 1000) : "",
      workOrderId: current.workOrderId,
    });
  }

  const status = typeof body.status === "string" && ["planned", "in_progress", "completed"].includes(body.status)
    ? body.status
    : undefined;

  return { data: { checklist: next, status } } as const;
}
