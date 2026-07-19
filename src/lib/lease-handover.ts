export const handoverChecklistKeys = [
  "identity_verified",
  "lease_signed",
  "contact_details_verified",
  "insurance_confirmed",
  "meter_reading_recorded",
  "keys_handed_over",
  "inspection_completed",
  "cleaning_approved",
  "keys_returned",
  "final_meter_reading_recorded",
] as const;

export type HandoverChecklistKey = (typeof handoverChecklistKeys)[number];
export type HandoverChecklist = Record<HandoverChecklistKey, boolean>;
export type HandoverKeyRecord = { id: string; label: string; quantity: number; handedOut: number; returned: number; note: string };
export type HandoverInspection = {
  status: "not_started" | "scheduled" | "completed" | "approved";
  scheduledAt: string | null;
  completedAt: string | null;
  inspector: string;
  condition: "not_assessed" | "approved" | "remarks" | "action_required";
  note: string;
};
export type LeaseHandoverPayload = {
  version: number;
  mode: "move_in" | "move_out";
  checklist: HandoverChecklist;
  keys: HandoverKeyRecord[];
  inspection: HandoverInspection;
  generalNote: string;
  completedAt: string | null;
  updatedAt: string;
  updatedBy: { id: string; name: string | null; email: string };
};

type Actor = { id: string; name: string | null; email: string };

export function emptyHandover(actor: Actor): LeaseHandoverPayload {
  return {
    version: 1,
    mode: "move_in",
    checklist: Object.fromEntries(handoverChecklistKeys.map((key) => [key, false])) as HandoverChecklist,
    keys: [],
    inspection: { status: "not_started", scheduledAt: null, completedAt: null, inspector: "", condition: "not_assessed", note: "" },
    generalNote: "",
    completedAt: null,
    updatedAt: new Date().toISOString(),
    updatedBy: actor,
  };
}

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function isoDate(value: unknown) {
  if (value === null || value === "" || value === undefined) return null;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return undefined;
  return new Date(value).toISOString();
}

export function parseHandoverInput(input: unknown, previous: LeaseHandoverPayload, actor: Actor) {
  if (!input || typeof input !== "object") return { error: "Ogiltigt underlag", status: 400 } as const;
  const body = input as Record<string, unknown>;
  const mode = body.mode === "move_in" || body.mode === "move_out" ? body.mode : null;
  if (!mode) return { error: "Välj inflyttning eller avflyttning", status: 400 } as const;
  if (body.version !== undefined && Number(body.version) !== previous.version) return { error: "Underlaget har ändrats av någon annan. Ladda om och försök igen.", status: 409 } as const;

  const rawChecklist = body.checklist && typeof body.checklist === "object" ? body.checklist as Record<string, unknown> : {};
  const checklist = Object.fromEntries(handoverChecklistKeys.map((key) => [key, rawChecklist[key] === true])) as HandoverChecklist;
  const rawKeys = Array.isArray(body.keys) ? body.keys : [];
  if (rawKeys.length > 100) return { error: "Högst 100 nyckelposter kan registreras", status: 400 } as const;
  const keys: HandoverKeyRecord[] = [];
  for (const raw of rawKeys) {
    if (!raw || typeof raw !== "object") return { error: "En nyckelpost är ogiltig", status: 400 } as const;
    const key = raw as Record<string, unknown>;
    const label = cleanText(key.label, 120);
    const quantity = Number(key.quantity);
    const handedOut = Number(key.handedOut);
    const returned = Number(key.returned);
    if (!label) return { error: "Alla nyckelposter måste ha en beteckning", status: 400 } as const;
    if (![quantity, handedOut, returned].every((value) => Number.isInteger(value) && value >= 0 && value <= 1000)) return { error: "Nyckelantal måste vara heltal mellan 0 och 1000", status: 400 } as const;
    if (handedOut > quantity || returned > handedOut) return { error: `Kontrollera antal för ${label}`, status: 400 } as const;
    keys.push({ id: cleanText(key.id, 80) || `${Date.now()}-${keys.length}`, label, quantity, handedOut, returned, note: cleanText(key.note, 500) });
  }

  const rawInspection = body.inspection && typeof body.inspection === "object" ? body.inspection as Record<string, unknown> : {};
  const status = ["not_started", "scheduled", "completed", "approved"].includes(String(rawInspection.status)) ? String(rawInspection.status) as HandoverInspection["status"] : "not_started";
  const condition = ["not_assessed", "approved", "remarks", "action_required"].includes(String(rawInspection.condition)) ? String(rawInspection.condition) as HandoverInspection["condition"] : "not_assessed";
  const scheduledAt = isoDate(rawInspection.scheduledAt);
  const completedAt = isoDate(rawInspection.completedAt);
  if (scheduledAt === undefined || completedAt === undefined) return { error: "Besiktningsdatumet är ogiltigt", status: 400 } as const;
  if (status === "scheduled" && !scheduledAt) return { error: "Planerad besiktning kräver ett datum", status: 400 } as const;
  if ((status === "completed" || status === "approved") && !completedAt) return { error: "Slutförd besiktning kräver ett genomförandedatum", status: 400 } as const;

  const complete = body.completed === true;
  const required: HandoverChecklistKey[] = mode === "move_in"
    ? ["identity_verified", "lease_signed", "contact_details_verified", "keys_handed_over", "inspection_completed"]
    : ["inspection_completed", "cleaning_approved", "keys_returned", "final_meter_reading_recorded"];
  if (complete && required.some((key) => !checklist[key])) return { error: "Slutför alla obligatoriska checklistpunkter innan överlämningen markeras klar", status: 400 } as const;
  if (complete && keys.some((key) => mode === "move_in" ? key.handedOut !== key.quantity : key.returned !== key.handedOut)) return { error: "Nyckelhanteringen måste vara balanserad innan överlämningen kan slutföras", status: 400 } as const;

  return { data: {
    version: previous.version + 1,
    mode,
    checklist,
    keys,
    inspection: { status, scheduledAt, completedAt, inspector: cleanText(rawInspection.inspector, 160), condition, note: cleanText(rawInspection.note, 3000) },
    generalNote: cleanText(body.generalNote, 5000),
    completedAt: complete ? previous.completedAt || new Date().toISOString() : null,
    updatedAt: new Date().toISOString(),
    updatedBy: actor,
  } satisfies LeaseHandoverPayload } as const;
}
