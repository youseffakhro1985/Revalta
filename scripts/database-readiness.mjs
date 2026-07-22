import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const findings = {};
const errors = [];

async function measure(name, operation) {
  try {
    findings[name] = await operation();
  } catch (error) {
    errors.push({ check: name, error: error instanceof Error ? error.message : "unknown error" });
  }
}

function distribution(model, field) {
  return model.groupBy({ by: [field], _count: { _all: true }, orderBy: { [field]: "asc" } });
}

await measure("counts", async () => ({
  companies: await db.company.count(),
  users: await db.user.count(),
  properties: await db.property.count(),
  tickets: await db.ticket.count(),
  workOrders: await db.workOrder.count(),
  projects: await db.project.count(),
  leases: await db.lease.count(),
  ticketAttachments: await db.ticketAttachment.count(),
  operationalDocuments: await db.operationalDocument.count(),
}));

await measure("nullableTenantKeys", async () => ({
  users: await db.user.count({ where: { company_id: null } }),
  properties: await db.property.count({ where: { company_id: null } }),
  tickets: await db.ticket.count({ where: { company_id: null } }),
  auditLogs: await db.auditLog.count({ where: { company_id: null } }),
  integrationEvents: await db.integrationEvent.count({ where: { company_id: null } }),
}));

await measure("tenantRelationMismatches", async () => {
  const rows = await db.$queryRaw`
    SELECT
      (SELECT COUNT(*)::int FROM "Property" p JOIN "User" u ON u."id" = p."user_id"
        WHERE p."company_id" IS DISTINCT FROM u."company_id") AS "propertyUser",
      (SELECT COUNT(*)::int FROM "Ticket" t JOIN "User" u ON u."id" = t."user_id"
        WHERE t."company_id" IS DISTINCT FROM u."company_id") AS "ticketCreator",
      (SELECT COUNT(*)::int FROM "Ticket" t JOIN "Property" p ON p."id" = t."property_id"
        WHERE t."company_id" IS DISTINCT FROM p."company_id") AS "ticketProperty",
      (SELECT COUNT(*)::int FROM "WorkOrder" w JOIN "Property" p ON p."id" = w."property_id"
        WHERE w."company_id" IS DISTINCT FROM p."company_id") AS "workOrderProperty",
      (SELECT COUNT(*)::int FROM "Project" p JOIN "Property" property ON property."id" = p."property_id"
        WHERE p."company_id" IS DISTINCT FROM property."company_id") AS "projectProperty",
      (SELECT COUNT(*)::int FROM "Lease" l JOIN "Unit" u ON u."id" = l."unit_id" JOIN "Property" p ON p."id" = u."property_id"
        WHERE l."company_id" IS DISTINCT FROM p."company_id") AS "leaseUnit"
  `;
  return rows[0];
});

await measure("fileReadiness", async () => {
  const rows = await db.$queryRaw`
    SELECT
      (SELECT COUNT(*)::int FROM "TicketAttachment" a WHERE a."data_url" LIKE 'data:%') AS "ticketDataUrls",
      (SELECT COUNT(*)::int FROM "TicketAttachment" a WHERE a."data_url" LIKE '%.public.blob.vercel-storage.com%') AS "ticketPublicBlobs",
      (SELECT COUNT(*)::int FROM "TicketAttachment" a JOIN "Ticket" t ON t."id" = a."ticket_id" WHERE t."company_id" IS NULL) AS "ticketAttachmentsWithoutTenant",
      (SELECT COUNT(*)::int FROM "OperationalDocument" d WHERE d."storage_key" LIKE '%.public.blob.vercel-storage.com%') AS "operationalPublicBlobs"
  `;
  return rows[0];
});

await measure("uniquenessReadiness", async () => {
  const rows = await db.$queryRaw`
    SELECT
      (SELECT COUNT(*)::int FROM (
        SELECT regexp_replace("org_number", '[^0-9]', '', 'g')
        FROM "Company" WHERE "org_number" IS NOT NULL AND btrim("org_number") <> ''
        GROUP BY regexp_replace("org_number", '[^0-9]', '', 'g') HAVING COUNT(*) > 1
      ) duplicates) AS "duplicateNormalizedCompanyOrgNumbers",
      (SELECT COUNT(*)::int FROM "Company"
        WHERE "org_number" IS NOT NULL AND btrim("org_number") <> ''
          AND length(regexp_replace("org_number", '[^0-9]', '', 'g')) <> 10) AS "invalidCompanyOrgNumberLength",
      (SELECT COUNT(*)::int FROM (
        SELECT "property_id", lower(btrim("designation"))
        FROM "Unit" GROUP BY "property_id", lower(btrim("designation")) HAVING COUNT(*) > 1
      ) duplicates) AS "duplicateUnitDesignationsWithinProperty"
  `;
  return rows[0];
});

await measure("statusValues", async () => ({
  userRoles: await distribution(db.user, "role"),
  userStatuses: await distribution(db.user, "status"),
  companyPlans: await distribution(db.company, "plan"),
  companyStatuses: await distribution(db.company, "status"),
  propertyTypes: await distribution(db.property, "property_type"),
  unitTypes: await distribution(db.unit, "unit_type"),
  ticketStatuses: await distribution(db.ticket, "status"),
  ticketPriorities: await distribution(db.ticket, "priority"),
  ticketCategories: await distribution(db.ticket, "category"),
  workOrderStatuses: await distribution(db.workOrder, "status"),
  projectStatuses: await distribution(db.project, "status"),
  projectRisks: await distribution(db.project, "risk"),
  leaseStatuses: await distribution(db.lease, "status"),
}));

const report = {
  generatedAt: new Date().toISOString(),
  database: "aggregate-readiness-audit",
  findings,
  errors,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
await db.$disconnect();
if (errors.length > 0) process.exitCode = 1;
