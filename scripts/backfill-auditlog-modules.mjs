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

  await backfill("LeaseHandoverRecord", async () => {
    const events = await prisma.integrationEvent.findMany({
      where: { type: "lease_handover_record", company_id: { not: null } },
      orderBy: { created_at: "asc" },
      take: 5000,
    });
    let localCreated = 0;
    let localSkipped = 0;
    for (const event of events) {
      if (!event.company_id || !event.recipient) { localSkipped += 1; continue; }
      const lease = await prisma.lease.findFirst({
        where: { id: event.recipient, company_id: event.company_id },
        select: { id: true },
      });
      if (!lease) { localSkipped += 1; continue; }
      if (await prisma.leaseHandoverRecord.findUnique({
        where: { company_id_lease_id: { company_id: event.company_id, lease_id: lease.id } },
      })) { localSkipped += 1; continue; }
      const payload = event.payload && typeof event.payload === "object" ? event.payload : null;
      if (!payload) { localSkipped += 1; continue; }
      const actorId = await prisma.user.findFirst({
        where: { company_id: event.company_id },
        orderBy: { created_at: "asc" },
        select: { id: true },
      });
      if (!actorId) { localSkipped += 1; continue; }
      const version = Number(payload.version || 1);
      await prisma.leaseHandoverRecord.create({
        data: {
          company_id: event.company_id,
          lease_id: lease.id,
          status: event.status || (payload.completedAt ? "completed" : "in_progress"),
          version: Number.isFinite(version) ? version : 1,
          payload,
          completed_at: payload.completedAt ? new Date(String(payload.completedAt)) : null,
          created_by_id: actorId.id,
          updated_by_id: actorId.id,
          created_at: event.created_at,
          updated_at: event.created_at,
        },
      });
      localCreated += 1;
    }
    created += localCreated;
    skipped += localSkipped;
    return { created: localCreated, skipped: localSkipped };
  });

  await backfill("LeaseInspectionRecord", async () => {
    const events = await prisma.integrationEvent.findMany({
      where: { type: "lease_inspection_items", company_id: { not: null } },
      orderBy: { created_at: "asc" },
      take: 5000,
    });
    let localCreated = 0;
    let localSkipped = 0;
    for (const event of events) {
      if (!event.company_id || !event.recipient) { localSkipped += 1; continue; }
      const lease = await prisma.lease.findFirst({
        where: { id: event.recipient, company_id: event.company_id },
        select: { id: true },
      });
      if (!lease) { localSkipped += 1; continue; }
      if (await prisma.leaseInspectionRecord.findUnique({
        where: { company_id_lease_id: { company_id: event.company_id, lease_id: lease.id } },
      })) { localSkipped += 1; continue; }
      const payload = event.payload && typeof event.payload === "object" ? event.payload : null;
      if (!payload) { localSkipped += 1; continue; }
      const actorId = await prisma.user.findFirst({
        where: { company_id: event.company_id },
        orderBy: { created_at: "asc" },
        select: { id: true },
      });
      if (!actorId) { localSkipped += 1; continue; }
      const version = Number(payload.version || 1);
      await prisma.leaseInspectionRecord.create({
        data: {
          company_id: event.company_id,
          lease_id: lease.id,
          status: event.status || "recorded",
          version: Number.isFinite(version) ? version : 1,
          payload,
          created_by_id: actorId.id,
          updated_by_id: actorId.id,
          created_at: event.created_at,
          updated_at: event.created_at,
        },
      });
      localCreated += 1;
    }
    created += localCreated;
    skipped += localSkipped;
    return { created: localCreated, skipped: localSkipped };
  });

  await backfill("LeaseInspectionWorkOrderLink", async () => {
    const events = await prisma.integrationEvent.findMany({
      where: { type: "lease_inspection_item_work_order", company_id: { not: null } },
      orderBy: { created_at: "asc" },
      take: 5000,
    });
    let localCreated = 0;
    let localSkipped = 0;
    for (const event of events) {
      const payload = event.payload && typeof event.payload === "object" ? event.payload : {};
      if (!event.company_id || !payload.leaseId || !payload.itemId || !payload.workOrderId) { localSkipped += 1; continue; }
      if (await prisma.leaseInspectionWorkOrderLink.findUnique({
        where: {
          company_id_lease_id_item_id: {
            company_id: event.company_id,
            lease_id: String(payload.leaseId),
            item_id: String(payload.itemId),
          },
        },
      })) { localSkipped += 1; continue; }
      const [lease, workOrder, actor] = await Promise.all([
        prisma.lease.findFirst({ where: { id: String(payload.leaseId), company_id: event.company_id }, select: { id: true } }),
        prisma.workOrder.findFirst({ where: { id: String(payload.workOrderId), company_id: event.company_id }, select: { id: true } }),
        prisma.user.findFirst({ where: { company_id: event.company_id }, orderBy: { created_at: "asc" }, select: { id: true } }),
      ]);
      if (!lease || !workOrder || !actor) { localSkipped += 1; continue; }
      await prisma.leaseInspectionWorkOrderLink.create({
        data: {
          company_id: event.company_id,
          lease_id: lease.id,
          item_id: String(payload.itemId),
          record_version: num(payload.recordVersion, 1),
          work_order_id: workOrder.id,
          created_by_id: actor.id,
          created_at: event.created_at,
        },
      });
      localCreated += 1;
    }
    created += localCreated;
    skipped += localSkipped;
    return { created: localCreated, skipped: localSkipped };
  });

  await backfill("ImdReading", async () => {
    const logs = await prisma.auditLog.findMany({
      where: { action: "imd.reading.created", company_id: { not: null } },
      orderBy: { created_at: "asc" },
      take: 5000,
    });
    let localCreated = 0;
    let localSkipped = 0;
    for (const log of logs) {
      const metadata = (log.metadata && typeof log.metadata === "object") ? log.metadata : {};
      if (metadata.storage === "ImdReading") { localSkipped += 1; continue; }
      if (!log.company_id || !log.actor_user_id || !log.entity_id) { localSkipped += 1; continue; }
      if (!metadata.unit || !metadata.meter_id || !metadata.period) { localSkipped += 1; continue; }
      const id = typeof metadata.readingId === "string" ? metadata.readingId : log.id;
      if (await prisma.imdReading.findUnique({ where: { id } })) { localSkipped += 1; continue; }
      const property = await prisma.property.findFirst({
        where: { id: log.entity_id, company_id: log.company_id },
        select: { id: true, name: true },
      });
      if (!property) { localSkipped += 1; continue; }
      await prisma.imdReading.create({
        data: {
          id,
          company_id: log.company_id,
          property_id: property.id,
          property_name: String(metadata.property_name || property.name),
          unit: String(metadata.unit),
          meter_id: String(metadata.meter_id),
          meter_type: String(metadata.meter_type || "electricity"),
          period: String(metadata.period),
          previous_reading: num(metadata.previous_reading),
          current_reading: num(metadata.current_reading),
          consumption: num(metadata.consumption),
          unit_price: num(metadata.unit_price),
          charge: num(metadata.charge),
          note: metadata.note ? String(metadata.note) : null,
          created_by_id: log.actor_user_id,
          created_at: log.created_at,
        },
      });
      if (!(await prisma.imdDebitLine.findUnique({ where: { imd_reading_id: id } }))) {
        await prisma.imdDebitLine.create({
          data: {
            company_id: log.company_id,
            imd_reading_id: id,
            property_id: property.id,
            unit: String(metadata.unit),
            meter_id: String(metadata.meter_id),
            meter_type: String(metadata.meter_type || "electricity"),
            period: String(metadata.period),
            consumption: num(metadata.consumption),
            unit_price: num(metadata.unit_price),
            charge: num(metadata.charge),
            status: "open",
            created_by_id: log.actor_user_id,
            created_at: log.created_at,
            updated_at: log.created_at,
          },
        });
      }
      localCreated += 1;
    }
    created += localCreated;
    skipped += localSkipped;
    return { created: localCreated, skipped: localSkipped };
  });

  await backfill("TicketOperation", async () => {
    const logs = await prisma.auditLog.findMany({
      where: {
        entity_type: "ticket",
        action: { startsWith: "workorder." },
        company_id: { not: null },
      },
      orderBy: { created_at: "asc" },
      take: 5000,
    });
    let localCreated = 0;
    let localSkipped = 0;
    for (const log of logs) {
      const metadata = (log.metadata && typeof log.metadata === "object") ? log.metadata : {};
      if (metadata.storage === "TicketOperation") { localSkipped += 1; continue; }
      if (!log.company_id || !log.actor_user_id || !log.entity_id) { localSkipped += 1; continue; }
      const match = /^workorder\.(time|cost|checklist|note)\.added$/.exec(log.action || "");
      if (!match) { localSkipped += 1; continue; }
      const operationType = match[1];
      const id = typeof metadata.operationId === "string" ? metadata.operationId : log.id;
      if (await prisma.ticketOperation.findUnique({ where: { id } })) { localSkipped += 1; continue; }
      const ticket = await prisma.ticket.findFirst({
        where: { id: log.entity_id, company_id: log.company_id },
        select: { id: true, title: true },
      });
      if (!ticket) { localSkipped += 1; continue; }
      await prisma.ticketOperation.create({
        data: {
          id,
          company_id: log.company_id,
          ticket_id: ticket.id,
          operation_type: operationType,
          description: metadata.description ? String(metadata.description) : null,
          minutes: metadata.minutes == null ? null : Math.round(num(metadata.minutes)),
          amount: metadata.amount == null ? null : num(metadata.amount),
          completed: typeof metadata.completed === "boolean" ? metadata.completed : null,
          ticket_title: metadata.ticketTitle ? String(metadata.ticketTitle) : ticket.title,
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

  await backfill("ManagedDocument", async () => {
    const logs = await prisma.auditLog.findMany({
      where: { entity_type: "document", action: "document.created", company_id: { not: null } },
      orderBy: { created_at: "asc" },
      take: 5000,
    });
    let localCreated = 0;
    let localSkipped = 0;
    for (const log of logs) {
      const metadata = (log.metadata && typeof log.metadata === "object") ? log.metadata : {};
      if (metadata.storage === "ManagedDocument") { localSkipped += 1; continue; }
      if (!log.company_id || !log.actor_user_id) { localSkipped += 1; continue; }
      const id = log.id;
      if (await prisma.managedDocument.findUnique({ where: { id } })) { localSkipped += 1; continue; }

      const lifecycleLogs = await prisma.auditLog.findMany({
        where: {
          company_id: log.company_id,
          entity_type: "document",
          entity_id: id,
          action: { in: ["document.archived", "document.unpublished", "document.restored"] },
        },
        orderBy: { created_at: "desc" },
        take: 1,
        select: { action: true },
      });
      const latestLifecycle = lifecycleLogs[0]?.action;
      const lifecycleState = latestLifecycle === "document.archived"
        ? "archived"
        : latestLifecycle === "document.unpublished"
          ? "unpublished"
          : "active";

      const fileName = String(metadata.fileName || metadata.name || "dokument");
      const contentType = String(metadata.contentType || "application/octet-stream");
      const sizeBytes = num(metadata.sizeBytes, 0);
      const storageUrl = metadata.storageUrl ? String(metadata.storageUrl) : null;
      const dataUrl = metadata.dataUrl ? String(metadata.dataUrl) : null;
      if (!storageUrl && !dataUrl) { localSkipped += 1; continue; }

      await prisma.managedDocument.create({
        data: {
          id,
          company_id: log.company_id,
          property_id: metadata.propertyId ? String(metadata.propertyId) : null,
          unit_id: metadata.unitId ? String(metadata.unitId) : null,
          lease_id: metadata.leaseId ? String(metadata.leaseId) : null,
          name: String(metadata.name || "Dokument"),
          category: String(metadata.category || "other"),
          visibility: String(metadata.visibility || "internal"),
          valid_until: dateOnly(metadata.validUntil),
          file_name: fileName,
          content_type: contentType,
          size_bytes: sizeBytes,
          storage_url: storageUrl,
          data_url: dataUrl,
          lifecycle_state: lifecycleState,
          created_by_id: log.actor_user_id,
          created_at: log.created_at,
          updated_at: log.created_at,
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
