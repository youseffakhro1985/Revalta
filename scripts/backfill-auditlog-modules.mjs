#!/usr/bin/env node
/**
 * Idempotent backfill from AuditLog metadata into dedicated tables.
 * Usage: node scripts/backfill-auditlog-modules.mjs
 * Requires DATABASE_URL (and DIRECT_URL if used by Prisma).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function dateOrNull(value) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateOnly(value) {
  const raw = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return dateOrNull(raw);
  return new Date(`${raw}T00:00:00.000Z`);
}

async function backfill(label, run) {
  const result = await run();
  console.log(`${label}: created=${result.created} skipped=${result.skipped}`);
  return result;
}

async function main() {
  let created = 0;
  let skipped = 0;

  await backfill("AppNotification", async () => {
    const logs = await prisma.auditLog.findMany({
      where: { action: "notification.created", company_id: { not: null } },
      orderBy: { created_at: "asc" },
      take: 5000,
    });
    let localCreated = 0;
    let localSkipped = 0;
    for (const log of logs) {
      const metadata = (log.metadata && typeof log.metadata === "object") ? log.metadata : {};
      if (metadata.storage === "AppNotification") { localSkipped += 1; continue; }
      const id = log.entity_id || log.id;
      const exists = await prisma.appNotification.findUnique({ where: { id } });
      if (exists) { localSkipped += 1; continue; }
      if (!log.company_id || !log.actor_user_id) { localSkipped += 1; continue; }
      await prisma.appNotification.create({
        data: {
          id,
          company_id: log.company_id,
          title: String(metadata.title || "Notis"),
          message: String(metadata.message || ""),
          priority: String(metadata.priority || "normal"),
          audience: String(metadata.audience || "Alla användare"),
          author_name: metadata.author_name ? String(metadata.author_name) : null,
          created_by_id: log.actor_user_id,
          created_at: log.created_at,
        },
      });
      localCreated += 1;
    }
    created += localCreated;
    skipped += localSkipped;
    return { created: localCreated, skipped: localSkipped };
  });

  await backfill("Booking", async () => {
    const logs = await prisma.auditLog.findMany({
      where: { action: "booking.created", company_id: { not: null } },
      orderBy: { created_at: "asc" },
      take: 5000,
    });
    let localCreated = 0;
    let localSkipped = 0;
    for (const log of logs) {
      const metadata = (log.metadata && typeof log.metadata === "object") ? log.metadata : {};
      if (metadata.storage === "Booking") { localSkipped += 1; continue; }
      if (!log.company_id || !log.actor_user_id || !log.entity_id) { localSkipped += 1; continue; }
      const start = dateOrNull(metadata.start);
      const end = dateOrNull(metadata.end);
      if (!start || !end || !metadata.resource || !metadata.resident_name) { localSkipped += 1; continue; }
      const exists = await prisma.booking.findFirst({
        where: {
          company_id: log.company_id,
          property_id: log.entity_id,
          resource: String(metadata.resource),
          start_at: start,
          end_at: end,
          resident_name: String(metadata.resident_name),
        },
        select: { id: true },
      });
      if (exists) { localSkipped += 1; continue; }
      await prisma.booking.create({
        data: {
          company_id: log.company_id,
          property_id: log.entity_id,
          resource: String(metadata.resource),
          resident_name: String(metadata.resident_name),
          unit: metadata.unit ? String(metadata.unit) : null,
          start_at: start,
          end_at: end,
          note: metadata.note ? String(metadata.note) : null,
          status: String(metadata.status || "confirmed"),
          created_by_id: log.actor_user_id,
          created_at: log.created_at,
        },
      });
      localCreated += 1;
    }
    created += localCreated;
    skipped += localSkipped;
    return { created: localCreated, skipped: localSkipped };
  });

  await backfill("Quote", async () => {
    const logs = await prisma.auditLog.findMany({
      where: { action: "quote.created", company_id: { not: null } },
      orderBy: { created_at: "asc" },
      take: 5000,
    });
    let localCreated = 0;
    let localSkipped = 0;
    for (const log of logs) {
      const metadata = (log.metadata && typeof log.metadata === "object") ? log.metadata : {};
      if (metadata.storage === "Quote") { localSkipped += 1; continue; }
      if (!log.company_id || !log.actor_user_id || !log.entity_id || !metadata.title) { localSkipped += 1; continue; }
      const exists = await prisma.quote.findUnique({ where: { id: log.id } });
      if (exists) { localSkipped += 1; continue; }
      await prisma.quote.create({
        data: {
          id: log.id,
          company_id: log.company_id,
          property_id: log.entity_id,
          title: String(metadata.title),
          supplier: metadata.supplier ? String(metadata.supplier) : null,
          status: String(metadata.status || "draft"),
          valid_until: dateOrNull(metadata.valid_until),
          labor: num(metadata.labor),
          material: num(metadata.material),
          supplier_cost: num(metadata.supplier_cost),
          other: num(metadata.other),
          subtotal: num(metadata.subtotal),
          vat_rate: num(metadata.vat_rate, 25),
          vat: num(metadata.vat),
          total: num(metadata.total),
          note: metadata.note ? String(metadata.note) : null,
          decision_comment: metadata.decision_comment ? String(metadata.decision_comment) : null,
          decision_at: dateOrNull(metadata.decision_at),
          decision_by: metadata.decision_by ? String(metadata.decision_by) : null,
          created_by_id: log.actor_user_id,
          created_at: log.created_at,
        },
      });
      localCreated += 1;
    }
    created += localCreated;
    skipped += localSkipped;
    return { created: localCreated, skipped: localSkipped };
  });

  await backfill("PortfolioMaintenanceItem", async () => {
    const logs = await prisma.auditLog.findMany({
      where: { action: "maintenance.plan.item", company_id: { not: null } },
      orderBy: { created_at: "asc" },
      take: 8000,
    });
    const latest = new Map();
    for (const log of logs) {
      const metadata = (log.metadata && typeof log.metadata === "object") ? log.metadata : {};
      const itemId = String(metadata.item_id || log.id);
      latest.set(itemId, { log, metadata, itemId });
    }
    let localCreated = 0;
    let localSkipped = 0;
    for (const { log, metadata, itemId } of latest.values()) {
      if (metadata.storage === "PortfolioMaintenanceItem") { localSkipped += 1; continue; }
      if (!log.company_id || !log.actor_user_id || !log.entity_id || !metadata.component || !metadata.measure) {
        localSkipped += 1;
        continue;
      }
      const exists = await prisma.portfolioMaintenanceItem.findUnique({ where: { id: itemId } });
      if (exists) { localSkipped += 1; continue; }
      await prisma.portfolioMaintenanceItem.create({
        data: {
          id: itemId,
          company_id: log.company_id,
          property_id: log.entity_id,
          component: String(metadata.component),
          measure: String(metadata.measure),
          planned_year: num(metadata.planned_year, new Date().getFullYear()),
          estimated_cost: num(metadata.estimated_cost),
          priority: String(metadata.priority || "normal"),
          interval_years: num(metadata.interval_years),
          status: String(metadata.status || "planned"),
          work_order_id: metadata.work_order_id ? String(metadata.work_order_id) : null,
          work_order_number: metadata.work_order_number ? String(metadata.work_order_number) : null,
          created_by_id: log.actor_user_id,
          created_at: log.created_at,
        },
      });
      localCreated += 1;
    }
    created += localCreated;
    skipped += localSkipped;
    return { created: localCreated, skipped: localSkipped };
  });

  const simplePropertyModules = [
    {
      label: "BudgetEntry",
      action: "budget.entry.created",
      create: async (log, metadata) => prisma.budgetEntry.create({
        data: {
          id: log.id,
          company_id: log.company_id,
          property_id: log.entity_id,
          year: num(metadata.year, new Date().getFullYear()),
          category: String(metadata.category || "other"),
          account: String(metadata.account || "konto"),
          budget: num(metadata.budget),
          forecast: num(metadata.forecast),
          actual: num(metadata.actual),
          note: metadata.note ? String(metadata.note) : null,
          created_by_id: log.actor_user_id,
          created_at: log.created_at,
        },
      }),
      exists: (id) => prisma.budgetEntry.findUnique({ where: { id } }),
      storage: "BudgetEntry",
      required: ["account"],
    },
    {
      label: "EnergyReading",
      action: "energy.reading.created",
      create: async (log, metadata) => prisma.energyReading.create({
        data: {
          id: log.id,
          company_id: log.company_id,
          property_id: log.entity_id,
          type: String(metadata.type || "electricity"),
          period: String(metadata.period || ""),
          unit: String(metadata.unit || ""),
          value: num(metadata.value),
          cost: num(metadata.cost),
          value_per_sqm: metadata.value_per_sqm === null || metadata.value_per_sqm === undefined ? null : num(metadata.value_per_sqm),
          cost_per_sqm: metadata.cost_per_sqm === null || metadata.cost_per_sqm === undefined ? null : num(metadata.cost_per_sqm),
          note: metadata.note ? String(metadata.note) : null,
          created_by_id: log.actor_user_id,
          created_at: log.created_at,
        },
      }),
      exists: (id) => prisma.energyReading.findUnique({ where: { id } }),
      storage: "EnergyReading",
      required: ["period", "unit"],
    },
  ];

  for (const job of simplePropertyModules) {
    await backfill(job.label, async () => {
      const logs = await prisma.auditLog.findMany({
        where: { action: job.action, company_id: { not: null } },
        orderBy: { created_at: "asc" },
        take: 5000,
      });
      let localCreated = 0;
      let localSkipped = 0;
      for (const log of logs) {
        const metadata = (log.metadata && typeof log.metadata === "object") ? log.metadata : {};
        if (metadata.storage === job.storage) { localSkipped += 1; continue; }
        if (!log.company_id || !log.actor_user_id || !log.entity_id) { localSkipped += 1; continue; }
        if (job.required.some((key) => !metadata[key])) { localSkipped += 1; continue; }
        if (await job.exists(log.id)) { localSkipped += 1; continue; }
        await job.create(log, metadata);
        localCreated += 1;
      }
      created += localCreated;
      skipped += localSkipped;
      return { created: localCreated, skipped: localSkipped };
    });
  }

  await backfill("ComplianceInspection", async () => {
    const logs = await prisma.auditLog.findMany({
      where: { action: "inspection.created", company_id: { not: null } },
      orderBy: { created_at: "asc" },
      take: 5000,
    });
    let localCreated = 0;
    let localSkipped = 0;
    for (const log of logs) {
      const metadata = (log.metadata && typeof log.metadata === "object") ? log.metadata : {};
      if (metadata.storage === "ComplianceInspection") { localSkipped += 1; continue; }
      const due = dateOnly(metadata.due_date);
      if (!log.company_id || !log.actor_user_id || !log.entity_id || !metadata.title || !due) { localSkipped += 1; continue; }
      if (await prisma.complianceInspection.findUnique({ where: { id: log.id } })) { localSkipped += 1; continue; }
      await prisma.complianceInspection.create({
        data: {
          id: log.id,
          company_id: log.company_id,
          property_id: log.entity_id,
          type: String(metadata.type || "other"),
          title: String(metadata.title),
          due_date: due,
          responsible: metadata.responsible ? String(metadata.responsible) : null,
          supplier: metadata.supplier ? String(metadata.supplier) : null,
          interval_months: num(metadata.interval_months),
          status: String(metadata.status || "planned"),
          note: metadata.note ? String(metadata.note) : null,
          created_by_id: log.actor_user_id,
          created_at: log.created_at,
        },
      });
      localCreated += 1;
    }
    created += localCreated;
    skipped += localSkipped;
    return { created: localCreated, skipped: localSkipped };
  });

  await backfill("InsuranceClaim", async () => {
    const logs = await prisma.auditLog.findMany({
      where: { action: "insurance_claim.created", company_id: { not: null } },
      orderBy: { created_at: "asc" },
      take: 5000,
    });
    let localCreated = 0;
    let localSkipped = 0;
    for (const log of logs) {
      const metadata = (log.metadata && typeof log.metadata === "object") ? log.metadata : {};
      if (metadata.storage === "InsuranceClaim") { localSkipped += 1; continue; }
      if (!log.company_id || !log.actor_user_id || !log.entity_id || !metadata.title) { localSkipped += 1; continue; }
      if (await prisma.insuranceClaim.findUnique({ where: { id: log.id } })) { localSkipped += 1; continue; }
      await prisma.insuranceClaim.create({
        data: {
          id: log.id,
          company_id: log.company_id,
          property_id: log.entity_id,
          title: String(metadata.title),
          damage_type: String(metadata.damage_type || "other"),
          incident_date: dateOrNull(metadata.incident_date),
          location: metadata.location ? String(metadata.location) : null,
          insurer: metadata.insurer ? String(metadata.insurer) : null,
          claim_number: metadata.claim_number ? String(metadata.claim_number) : null,
          responsible: metadata.responsible ? String(metadata.responsible) : null,
          status: String(metadata.status || "reported"),
          estimated_cost: num(metadata.estimated_cost),
          deductible: num(metadata.deductible),
          compensation: num(metadata.compensation),
          note: metadata.note ? String(metadata.note) : null,
          created_by_id: log.actor_user_id,
          created_at: log.created_at,
        },
      });
      localCreated += 1;
    }
    created += localCreated;
    skipped += localSkipped;
    return { created: localCreated, skipped: localSkipped };
  });

  await backfill("RentNotice", async () => {
    const logs = await prisma.auditLog.findMany({
      where: { action: "rent_notice.created", company_id: { not: null } },
      orderBy: { created_at: "asc" },
      take: 5000,
    });
    let localCreated = 0;
    let localSkipped = 0;
    for (const log of logs) {
      const metadata = (log.metadata && typeof log.metadata === "object") ? log.metadata : {};
      if (metadata.storage === "RentNotice") { localSkipped += 1; continue; }
      const due = dateOnly(metadata.due_date);
      if (!log.company_id || !log.actor_user_id || !log.entity_id || !metadata.period || !due) { localSkipped += 1; continue; }
      if (await prisma.rentNotice.findUnique({ where: { id: log.id } })) { localSkipped += 1; continue; }
      await prisma.rentNotice.create({
        data: {
          id: log.id,
          company_id: log.company_id,
          property_id: log.entity_id,
          lease_id: metadata.lease_id ? String(metadata.lease_id) : null,
          tenant_name: String(metadata.tenant_name || "Hyresgäst"),
          unit: metadata.unit ? String(metadata.unit) : null,
          period: String(metadata.period),
          due_date: due,
          status: String(metadata.status || "draft"),
          base_rent: num(metadata.base_rent),
          index_percent: num(metadata.index_percent),
          indexed_rent: num(metadata.indexed_rent),
          additions: num(metadata.additions),
          deductions: num(metadata.deductions),
          total: num(metadata.total),
          note: metadata.note ? String(metadata.note) : null,
          created_by_id: log.actor_user_id,
          created_at: log.created_at,
        },
      });
      localCreated += 1;
    }
    created += localCreated;
    skipped += localSkipped;
    return { created: localCreated, skipped: localSkipped };
  });

  await backfill("CalendarEvent", async () => {
    const logs = await prisma.auditLog.findMany({
      where: { action: "calendar.event", company_id: { not: null } },
      orderBy: { created_at: "asc" },
      take: 5000,
    });
    let localCreated = 0;
    let localSkipped = 0;
    for (const log of logs) {
      const metadata = (log.metadata && typeof log.metadata === "object") ? log.metadata : {};
      if (metadata.storage === "CalendarEvent") { localSkipped += 1; continue; }
      const date = dateOnly(metadata.date);
      const id = log.entity_id || log.id;
      if (!log.company_id || !log.actor_user_id || !metadata.title || !date) { localSkipped += 1; continue; }
      if (await prisma.calendarEvent.findUnique({ where: { id } })) { localSkipped += 1; continue; }
      await prisma.calendarEvent.create({
        data: {
          id,
          company_id: log.company_id,
          title: String(metadata.title),
          date,
          time: metadata.time ? String(metadata.time) : null,
          type: String(metadata.type || "Aktivitet"),
          property_name: metadata.property_name ? String(metadata.property_name) : null,
          responsible: metadata.responsible ? String(metadata.responsible) : null,
          note: metadata.note ? String(metadata.note) : null,
          status: String(metadata.status || "planned"),
          created_by_id: log.actor_user_id,
          created_at: log.created_at,
        },
      });
      localCreated += 1;
    }
    created += localCreated;
    skipped += localSkipped;
    return { created: localCreated, skipped: localSkipped };
  });

  await backfill("VendorContract", async () => {
    const logs = await prisma.auditLog.findMany({
      where: { entity_type: "vendor_contract", company_id: { not: null } },
      orderBy: { created_at: "asc" },
      take: 5000,
    });
    let localCreated = 0;
    let localSkipped = 0;
    for (const log of logs) {
      const metadata = (log.metadata && typeof log.metadata === "object") ? log.metadata : {};
      if (metadata.storage === "VendorContract") { localSkipped += 1; continue; }
      const id = log.entity_id || log.id;
      if (!log.company_id || !log.actor_user_id || !metadata.name) { localSkipped += 1; continue; }
      if (await prisma.vendorContract.findUnique({ where: { id } })) { localSkipped += 1; continue; }
      await prisma.vendorContract.create({
        data: {
          id,
          company_id: log.company_id,
          property_id: metadata.propertyId ? String(metadata.propertyId) : null,
          name: String(metadata.name),
          org_number: metadata.orgNumber ? String(metadata.orgNumber) : null,
          category: String(metadata.category || "Övrigt"),
          contact_name: metadata.contactName ? String(metadata.contactName) : null,
          email: metadata.email ? String(metadata.email) : null,
          phone: metadata.phone ? String(metadata.phone) : null,
          contract_title: metadata.contractTitle ? String(metadata.contractTitle) : null,
          contract_value: num(metadata.contractValue),
          start_date: dateOrNull(metadata.startDate),
          end_date: dateOrNull(metadata.endDate),
          notice_months: num(metadata.noticeMonths),
          status: String(metadata.status || "active"),
          created_by_id: log.actor_user_id,
          created_at: log.created_at,
        },
      });
      localCreated += 1;
    }
    created += localCreated;
    skipped += localSkipped;
    return { created: localCreated, skipped: localSkipped };
  });

  console.log(`Backfill complete: created=${created} skipped=${skipped}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
