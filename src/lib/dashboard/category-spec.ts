export type CategorySpecItem = {
  label: string;
  value: string;
};

export type CategoryMeta = {
  module: string;
  route: string;
  plane: string;
  api: string;
  functions: string[];
};

export const CATEGORY_CATALOG: Record<string, CategoryMeta> = {
  fastigheter: {
    module: "Portfölj",
    route: "/dashboard/fastigheter",
    plane: "Property · Building · Unit · tenant-scope",
    api: "GET/POST /api/properties",
    functions: ["Sök", "Filtrera", "Exportera CSV", "Ny fastighet", "Fastighetskort"],
  },
  "ny-fastighet": {
    module: "Portfölj",
    route: "/dashboard/fastigheter/ny",
    plane: "Property create · tenant-scope",
    api: "POST /api/properties",
    functions: ["Registrera", "Validera", "Öppna kort"],
  },
  arenden: {
    module: "Drift",
    route: "/dashboard/felanmalan",
    plane: "Ticket + AI-fält · tenant-scope",
    api: "GET/POST /api/tickets",
    functions: ["Registrera", "Tilldela", "AI-klassificera", "Exportera", "Handlägg"],
  },
  "arende-detalj": {
    module: "Drift",
    route: "/dashboard/felanmalan/[id]",
    plane: "Ticket detail · comments · AI",
    api: "GET/PATCH /api/tickets/:id",
    functions: ["Uppdatera", "Kommentera", "Skapa arbetsorder", "AI-stöd"],
  },
  arbetsorder: {
    module: "Drift",
    route: "/dashboard/arbetsorder",
    plane: "WorkOrder · SLA · enterprise-fält",
    api: "GET/POST /api/work-orders",
    functions: ["Planera", "Tilldela", "SLA", "Karta", "Ny arbetsorder"],
  },
  "arbetsorder-ny": {
    module: "Drift",
    route: "/dashboard/arbetsorder/ny",
    plane: "WorkOrder create + AI-notes",
    api: "POST /api/work-orders",
    functions: ["Skapa", "Koppla fastighet", "Sätt SLA", "Tilldela"],
  },
  "arbetsorder-detalj": {
    module: "Drift",
    route: "/dashboard/arbetsorder/[id]",
    plane: "WorkOrder execution · ekonomi · dokument",
    api: "GET/PATCH /api/work-orders/:id",
    functions: ["Utför", "Tid & material", "Rapport", "Fakturaunderlag"],
  },
  operationsoversikt: {
    module: "Drift",
    route: "/dashboard/arbetsorder/operationsoversikt",
    plane: "WorkOrder operations queue",
    api: "GET /api/work-orders/operations-overview",
    functions: ["Prioritera", "SLA-kö", "Tilldela", "Filtrera risk"],
  },
  planering: {
    module: "Drift",
    route: "/dashboard/arbetsorder/planering",
    plane: "Technician workload · SLA",
    api: "GET/PATCH /api/work-orders",
    functions: ["Fördela", "Tilldela", "SLA-fokus", "Uppdatera"],
  },
  aterkommande: {
    module: "Drift",
    route: "/dashboard/arbetsorder/aterkommande",
    plane: "RecurringWorkOrder · cron",
    api: "GET/POST /api/work-orders/recurring",
    functions: ["Schemalägg", "Kör förfallna", "Incidenter", "SLA"],
  },
  incidenter: {
    module: "Drift",
    route: "/dashboard/arbetsorder/aterkommande/incidenter",
    plane: "Recurring incident · escalation",
    api: "GET /api/work-orders/recurring/incidents",
    functions: ["Tilldela", "Kvittera", "Eskalera", "SLA-rapport"],
  },
  "sla-rapport": {
    module: "Drift",
    route: "/dashboard/arbetsorder/aterkommande/incidenter/sla-rapport",
    plane: "SLA analytics",
    api: "GET /api/work-orders/recurring/incidents/sla-report",
    functions: ["Analysera", "Exportera CSV", "Byt period"],
  },
  redigeringslas: {
    module: "Drift",
    route: "/dashboard/arbetsorder/redigeringslas",
    plane: "WorkOrder exclusive lease",
    api: "GET /api/work-orders/locks",
    functions: ["Övervaka", "Lease-tid", "Aktiva redigerare"],
  },
  kalender: {
    module: "Drift",
    route: "/dashboard/kalender",
    plane: "OperationalActivity · calendar",
    api: "GET/POST /api/operational-activities",
    functions: ["Planera", "Filtrera", "Ny aktivitet", "Tidslinje"],
  },
  ronder: {
    module: "Drift",
    route: "/dashboard/ronder",
    plane: "InspectionRound · checklist",
    api: "GET/POST /api/rounds",
    functions: ["Planera ronder", "Checklistor", "Genomför", "Avvikelse"],
  },
  besiktningar: {
    module: "Drift",
    route: "/dashboard/besiktningar",
    plane: "Compliance inspection register",
    api: "GET/POST /api/inspections",
    functions: ["OVK/SBA", "Deadline", "Ny kontroll", "Efterlevnad"],
  },
  underhall: {
    module: "Drift",
    route: "/dashboard/underhall",
    plane: "Preventive maintenance plan",
    api: "GET/POST /api/maintenance",
    functions: ["Flerårsplan", "Kostnad", "Skapa arbetsorder", "Prioritera"],
  },
  skador: {
    module: "Drift",
    route: "/dashboard/skador",
    plane: "Insurance claim · finance",
    api: "GET/POST /api/claims",
    functions: ["Registrera", "Försäkring", "Kostnad", "Uppföljning"],
  },
  boendeportal: {
    module: "Boende & uthyrning",
    route: "/dashboard/boendeportal",
    plane: "Resident tickets · lease-bound",
    api: "GET/POST /api/resident/tickets",
    functions: ["Felanmälan", "Status", "Hyresavtal", "Kommunikation"],
  },
  "boende-arende": {
    module: "Boende & uthyrning",
    route: "/dashboard/boendeportal/arenden/[id]",
    plane: "Resident ticket thread",
    api: "GET /api/resident/tickets/:id",
    functions: ["Följ status", "Läs uppdateringar"],
  },
  "boende-dokument": {
    module: "Boende & uthyrning",
    route: "/dashboard/boendeportal/dokument",
    plane: "Resident-visible documents",
    api: "GET /api/resident/documents",
    functions: ["Läs", "Ladda ner"],
  },
  "boende-avier": {
    module: "Boende & uthyrning",
    route: "/dashboard/boendeportal/avier",
    plane: "Resident rent notices",
    api: "GET /api/resident/rent-notices",
    functions: ["Visa avier", "Betalstatus"],
  },
  "boende-bokningar": {
    module: "Boende & uthyrning",
    route: "/dashboard/boendeportal/bokningar",
    plane: "Resident resource bookings",
    api: "GET/POST /api/resident/bookings",
    functions: ["Boka", "Avboka", "Kalender"],
  },
  "boende-konto": {
    module: "Boende & uthyrning",
    route: "/dashboard/boendeportal/konto",
    plane: "Resident profile",
    api: "GET/PATCH /api/resident/account",
    functions: ["Uppgifter", "Säkerhet"],
  },
  uthyrning: {
    module: "Boende & uthyrning",
    route: "/dashboard/uthyrning",
    plane: "Lease · LeaseHolder · Unit",
    api: "GET/POST /api/leases",
    functions: ["Avtal", "Vakans", "Hyrespart", "Överlämning"],
  },
  "uthyrning-overlamning": {
    module: "Boende & uthyrning",
    route: "/dashboard/uthyrning/overlamning",
    plane: "Handover · inspection · keys",
    api: "GET/POST /api/leases/handover",
    functions: ["Besiktning", "Nycklar", "Arbetsorder", "Slutrapport"],
  },
  hyresavisering: {
    module: "Boende & uthyrning",
    route: "/dashboard/hyresavisering",
    plane: "RentNotice · index",
    api: "GET/POST /api/rent-notices",
    functions: ["Skapa avi", "Index", "Betalstatus", "Påminn"],
  },
  bokningar: {
    module: "Boende & uthyrning",
    route: "/dashboard/bokningar",
    plane: "Shared resource booking",
    api: "GET/POST /api/bookings",
    functions: ["Resurser", "Kalender", "Boendekoppling"],
  },
  nycklar: {
    module: "Boende & uthyrning",
    route: "/dashboard/nycklar",
    plane: "Access credential register",
    api: "GET/POST /api/access-credentials",
    functions: ["Register", "Utlämning", "Spärr", "Exportera"],
  },
  ekonomi: {
    module: "Ekonomi & analys",
    route: "/dashboard/ekonomi",
    plane: "BudgetEntry · RentNotice",
    api: "GET /api/budget · /api/rent-notices",
    functions: ["Driftnetto", "Avier", "Utfall", "Ny utbetalning"],
  },
  "ny-utbetalning": {
    module: "Ekonomi & analys",
    route: "/dashboard/ekonomi/ny-utbetalning",
    plane: "Budget actual write",
    api: "POST /api/budget",
    functions: ["Registrera utfall", "Konto", "Fastighet"],
  },
  budget: {
    module: "Ekonomi & analys",
    route: "/dashboard/budget",
    plane: "Budget vs actual",
    api: "GET/POST /api/budget",
    functions: ["Budgetera", "Prognos", "Avvikelse", "Exportera"],
  },
  offerter: {
    module: "Ekonomi & analys",
    route: "/dashboard/offerter",
    plane: "Quote · decision trail",
    api: "GET/POST /api/quotes",
    functions: ["Kalkyl", "Beslut", "Historik", "CSV"],
  },
  energi: {
    module: "Ekonomi & analys",
    route: "/dashboard/energi",
    plane: "Energy reading · cost drivers",
    api: "GET/POST /api/energy",
    functions: ["El/värme/vatten", "Jämför", "CSV", "Åtgärd"],
  },
  imd: {
    module: "Ekonomi & analys",
    route: "/dashboard/imd",
    plane: "Meter · IMD debit",
    api: "GET/POST /api/imd",
    functions: ["Avläsning", "Debitering", "Koppla avi", "CSV"],
  },
  rapporter: {
    module: "Ekonomi & analys",
    route: "/dashboard/rapporter",
    plane: "Live aggregat · tenant-scope",
    api: "Server-rendered report queries",
    functions: ["Period", "Fastighet", "Exportera", "Beslutsunderlag"],
  },
  dokument: {
    module: "Dokument & projekt",
    route: "/dashboard/dokument",
    plane: "Library document · AI-klassificering",
    api: "GET/POST /api/documents",
    functions: ["Ladda upp", "Livscykel", "Publicera", "CSV", "AI-kategori"],
  },
  projekt: {
    module: "Dokument & projekt",
    route: "/dashboard/projekt",
    plane: "Project portfolio",
    api: "GET/POST /api/projects",
    functions: ["Portfölj", "Budget", "Tidslinje", "Risk"],
  },
  "projekt-detalj": {
    module: "Dokument & projekt",
    route: "/dashboard/projekt/[id]",
    plane: "Project workspace",
    api: "GET/PATCH /api/projects/:id",
    functions: ["Styrning", "Ekonomi", "Dokument", "Beslut"],
  },
  team: {
    module: "Organisation",
    route: "/dashboard/team",
    plane: "User · invitation · workload",
    api: "GET/POST /api/team",
    functions: ["Inbjudan", "Roller", "Arbetsbelastning"],
  },
  leverantorer: {
    module: "Organisation",
    route: "/dashboard/leverantorer",
    plane: "Vendor · contract watch",
    api: "GET/POST /api/vendors",
    functions: ["Register", "Avtal", "Bevakning", "Kontakt"],
  },
  installningar: {
    module: "Administration",
    route: "/dashboard/installningar",
    plane: "Profile · Company · security",
    api: "GET/PATCH /api/settings",
    functions: ["Profil", "Organisation", "Säkerhet", "Aviseringar"],
  },
  serviceaviseringar: {
    module: "Administration",
    route: "/dashboard/installningar/aviseringar",
    plane: "Service notification config",
    api: "GET/PATCH /api/settings/service-notifications",
    functions: ["Mottagare", "Schema", "Testutskick", "E-posthälsa"],
  },
  eskaleringar: {
    module: "Administration",
    route: "/dashboard/installningar/eskaleringar",
    plane: "Escalation engine",
    api: "GET/PATCH /api/settings/escalations",
    functions: ["Regler", "Motorstatus", "Historik"],
  },
  "mina-aviseringar": {
    module: "Administration",
    route: "/dashboard/installningar/mina-aviseringar",
    plane: "Personal notification prefs",
    api: "GET/PATCH /api/settings/my-notifications",
    functions: ["E-postval", "Konto"],
  },
  behorigheter: {
    module: "Administration",
    route: "/dashboard/behorigheter",
    plane: "Role matrix",
    api: "Read-only permissions catalog",
    functions: ["Roller", "Åtkomstnivåer"],
  },
  integrationer: {
    module: "Administration",
    route: "/dashboard/integrationer",
    plane: "Integration status · secrets",
    api: "GET /api/integrations",
    functions: ["Status", "Ekonomikoppling", "Händelser"],
  },
  drift: {
    module: "Administration",
    route: "/dashboard/drift",
    plane: "Health · schema · cron",
    api: "GET /api/health",
    functions: ["Databas", "Secrets", "Cron", "Release"],
  },
  billing: {
    module: "Administration",
    route: "/dashboard/billing",
    plane: "Stripe plan · usage",
    api: "GET/POST /api/billing",
    functions: ["Plan", "Kapacitet", "Checkout", "Portal"],
  },
  audit: {
    module: "Administration",
    route: "/dashboard/audit",
    plane: "AuditLog · tenant-isolated",
    api: "GET /api/audit-logs",
    functions: ["Filtrera", "Exportera", "Spårbarhet"],
  },
  notiser: {
    module: "Organisation",
    route: "/dashboard/notiser",
    plane: "Internal notification + events",
    api: "GET/POST /api/notifications",
    functions: ["Publicera", "Lästmarkera", "Prioritet", "Händelser"],
  },
  aviseringscenter: {
    module: "Drift",
    route: "/dashboard/aviseringscenter",
    plane: "Service + SLA + recurring alerts",
    api: "GET/PATCH /api/notification-center",
    functions: ["Prioritera", "Lästmarkera", "Snooze", "SLA"],
  },
  eskaleringsregler: {
    module: "Administration",
    route: "/dashboard/installningar/eskaleringar/regler",
    plane: "Escalation rule engine",
    api: "GET/PUT /api/settings/service-escalation-rules",
    functions: ["Motor", "Orsaker", "Mottagarroller", "Repetition"],
  },
  fakturaexporter: {
    module: "Administration",
    route: "/dashboard/integrationer/fakturaexporter",
    plane: "Invoice export jobs · Fortnox/Visma",
    api: "GET/POST /api/integrations/invoice-exports",
    functions: ["Kö", "Återförsök", "Avbryt", "Kvittens"],
  },
  "fastighet-detalj": {
    module: "Portfölj",
    route: "/dashboard/fastigheter/[id]",
    plane: "Property workspace · buildings · units",
    api: "GET /api/properties/:id",
    functions: ["Pärm", "Objekt", "Drift", "Ärenden", "Ekonomi"],
  },
  "underhall-portfolj": {
    module: "Drift",
    route: "/dashboard/underhall/portfolio",
    plane: "Maintenance portfolio · indexed cost",
    api: "GET /api/maintenance/portfolio",
    functions: ["Bestånd", "Skuld", "Risk", "Tidshorisont"],
  },
  "underhall-service": {
    module: "Drift",
    route: "/dashboard/underhall/service",
    plane: "Preventive service engine",
    api: "GET/POST /api/maintenance/service",
    functions: ["Serviceplan", "Automatik", "Kör motor", "Komponenter"],
  },
};

const FALLBACK_META: CategoryMeta = {
  module: "Revalta",
  route: "/dashboard",
  plane: "Organisationsscoped datalager",
  api: "Tenant API",
  functions: ["Visa", "Filtrera", "Exportera"],
};

export function getCategoryMeta(id: string): CategoryMeta {
  return CATEGORY_CATALOG[id] ?? FALLBACK_META;
}

export function categorySpec(
  id: string,
  extras?: { records?: string; extras?: CategorySpecItem[] },
): CategorySpecItem[] {
  const meta = getCategoryMeta(id);
  const items: CategorySpecItem[] = [
    { label: "Modul", value: meta.module },
    { label: "Yta", value: meta.route },
    { label: "Dataplan", value: meta.plane },
    { label: "API", value: meta.api },
  ];
  if (extras?.records) items.push({ label: "Poster", value: extras.records });
  if (extras?.extras?.length) items.push(...extras.extras);
  return items;
}

export function categoryFunctions(id: string): string[] {
  return getCategoryMeta(id).functions;
}

export function knownCategoryIds() {
  return Object.keys(CATEGORY_CATALOG);
}
