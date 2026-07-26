#!/usr/bin/env node
/**
 * Idempotent backfill from AuditLog metadata into dedicated tables.
 * Usage: node scripts/backfill-auditlog-modules.mjs
 * Requires DATABASE_URL (and DIRECT_URL if used by Prisma).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Offset-paginated findMany — avoids silent truncation from hard take caps. */
async function fetchAll(findMany, where, orderBy = { created_at: "asc" }, pageSize = 1000, name = null) {
  const all = [];
  let skip = 0;
  let pages = 0;
  for (;;) {
    const rows = await findMany({ where, orderBy, take: pageSize, skip });
    pages += 1;
    all.push(...rows);
    if (rows.length < pageSize) break;
    skip += pageSize;
    if (skip > 500000) break; // safety
  }
  if (name && pages > 1) {
    console.log(`  paginated ${name}: ${all.length} rows`);
  }
  return all;
}

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
    const logs = await fetchAll(
      (args) => prisma.auditLog.findMany(args),
      { action: "notification.created", company_id: { not: null } },
      { created_at: "asc" },
      1000,
      "logs",
    );
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
    const logs = await fetchAll(
      (args) => prisma.auditLog.findMany(args),
      { action: "booking.created", company_id: { not: null } },
      { created_at: "asc" },
      1000,
      "Booking",
    );
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
    const logs = await fetchAll(
      (args) => prisma.auditLog.findMany(args),
      { action: "quote.created", company_id: { not: null } },
      { created_at: "asc" },
      1000,
      "Quote",
    );
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
      const logs = await fetchAll(
        (args) => prisma.auditLog.findMany(args),
        { action: job.action, company_id: { not: null } },
        { created_at: "asc" },
        1000,
        "logs",
      );
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
    const logs = await fetchAll(
      (args) => prisma.auditLog.findMany(args),
      { action: "inspection.created", company_id: { not: null } },
      { created_at: "asc" },
      1000,
      "logs",
    );
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
    const logs = await fetchAll(
      (args) => prisma.auditLog.findMany(args),
      { action: "insurance_claim.created", company_id: { not: null } },
      { created_at: "asc" },
      1000,
      "logs",
    );
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
    const logs = await fetchAll(
      (args) => prisma.auditLog.findMany(args),
      { action: "rent_notice.created", company_id: { not: null } },
      { created_at: "asc" },
      1000,
      "logs",
    );
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
    const logs = await fetchAll(
      (args) => prisma.auditLog.findMany(args),
      { action: "calendar.event", company_id: { not: null } },
      { created_at: "asc" },
      1000,
      "logs",
    );
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
    const events = await fetchAll(
      (args) => prisma.integrationEvent.findMany(args),
      { type: "lease_handover_record", company_id: { not: null } },
      { created_at: "asc" },
      1000,
      "events",
    );
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
    const events = await fetchAll(
      (args) => prisma.integrationEvent.findMany(args),
      { type: "lease_inspection_items", company_id: { not: null } },
      { created_at: "asc" },
      1000,
      "events",
    );
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
    const events = await fetchAll(
      (args) => prisma.integrationEvent.findMany(args),
      { type: "lease_inspection_item_work_order", company_id: { not: null } },
      { created_at: "asc" },
      1000,
      "events",
    );
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
    const logs = await fetchAll(
      (args) => prisma.auditLog.findMany(args),
      { action: "imd.reading.created", company_id: { not: null } },
      { created_at: "asc" },
      1000,
      "logs",
    );
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
    const logs = await fetchAll(
      (args) => prisma.auditLog.findMany(args),
      {
        entity_type: "ticket",
        action: { startsWith: "workorder." },
        company_id: { not: null },
      },
      { created_at: "asc" },
      1000,
      "logs",
    );
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
    const logs = await fetchAll(
      (args) => prisma.auditLog.findMany(args),
      { entity_type: "document", action: "document.created", company_id: { not: null } },
      { created_at: "asc" },
      1000,
      "ManagedDocument",
    );
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

  await backfill("WorkOrderTimeEntry", async () => {
    const events = await fetchAll(
      (args) => prisma.integrationEvent.findMany(args),
      { type: "work_order.time_entry", company_id: { not: null }, recipient: { not: null } },
      { created_at: "asc" },
      1000,
      "WorkOrderTimeEntry",
    );
    let localCreated = 0;
    let localSkipped = 0;
    const latest = new Map();
    for (const event of events) {
      const payload = (event.payload && typeof event.payload === "object") ? event.payload : null;
      if (!payload?.entryId || !event.company_id || !event.recipient) { localSkipped += 1; continue; }
      latest.set(`${event.company_id}:${payload.entryId}`, { event, payload });
    }
    for (const { event, payload } of latest.values()) {
      if (await prisma.workOrderTimeEntry.findUnique({ where: { id: String(payload.entryId) } })) { localSkipped += 1; continue; }
      const workOrder = await prisma.workOrder.findFirst({
        where: { id: event.recipient, company_id: event.company_id },
        select: { id: true },
      });
      if (!workOrder || !payload.userId || !payload.userEmail) { localSkipped += 1; continue; }
      await prisma.workOrderTimeEntry.create({
        data: {
          id: String(payload.entryId),
          company_id: event.company_id,
          work_order_id: event.recipient,
          user_id: String(payload.userId),
          user_name: payload.userName ? String(payload.userName) : null,
          user_email: String(payload.userEmail),
          kind: String(payload.kind || "work"),
          action: String(payload.action || "manual"),
          started_at: dateOrNull(payload.startedAt),
          ended_at: dateOrNull(payload.endedAt),
          minutes: payload.minutes == null ? null : num(payload.minutes),
          billable: payload.billable !== false,
          note: payload.note ? String(payload.note) : null,
          status: String(payload.status || "submitted"),
          actor_id: String(payload.actorId || payload.userId),
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

  await backfill("WorkOrderMaterialEntry", async () => {
    const events = await fetchAll(
      (args) => prisma.integrationEvent.findMany(args),
      { type: "work_order.material_entry", company_id: { not: null }, recipient: { not: null } },
      { created_at: "asc" },
      1000,
      "WorkOrderMaterialEntry",
    );
    let localCreated = 0;
    let localSkipped = 0;
    const latest = new Map();
    for (const event of events) {
      const payload = (event.payload && typeof event.payload === "object") ? event.payload : null;
      if (!payload?.entryId || !event.company_id || !event.recipient) { localSkipped += 1; continue; }
      latest.set(`${event.company_id}:${payload.entryId}`, { event, payload });
    }
    for (const { event, payload } of latest.values()) {
      if (await prisma.workOrderMaterialEntry.findUnique({ where: { id: String(payload.entryId) } })) { localSkipped += 1; continue; }
      if (!payload.name || !payload.createdById || !payload.createdByEmail) { localSkipped += 1; continue; }
      const workOrder = await prisma.workOrder.findFirst({
        where: { id: event.recipient, company_id: event.company_id },
        select: { id: true },
      });
      if (!workOrder) { localSkipped += 1; continue; }
      await prisma.workOrderMaterialEntry.create({
        data: {
          id: String(payload.entryId),
          company_id: event.company_id,
          work_order_id: event.recipient,
          article_number: payload.articleNumber ? String(payload.articleNumber) : null,
          name: String(payload.name),
          quantity: num(payload.quantity, 1),
          unit: String(payload.unit || "st"),
          unit_price: num(payload.unitPrice),
          total: num(payload.total),
          supplier: payload.supplier ? String(payload.supplier) : null,
          stock_status: String(payload.stockStatus || "used"),
          billable: payload.billable !== false,
          note: payload.note ? String(payload.note) : null,
          status: String(payload.status || "submitted"),
          created_by_id: String(payload.createdById),
          created_by_name: payload.createdByName ? String(payload.createdByName) : null,
          created_by_email: String(payload.createdByEmail),
          actor_id: String(payload.actorId || payload.createdById),
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

  await backfill("WorkOrderProfitabilitySettings", async () => {
    const events = await prisma.integrationEvent.findMany({
      where: { type: "work_order.profitability_settings", company_id: { not: null }, recipient: { not: null } },
      orderBy: { created_at: "desc" },
      take: 10000,
    });
    let localCreated = 0;
    let localSkipped = 0;
    const seen = new Set();
    for (const event of events) {
      if (!event.company_id || !event.recipient || seen.has(event.recipient)) { localSkipped += 1; continue; }
      seen.add(event.recipient);
      if (await prisma.workOrderProfitabilitySettings.findUnique({ where: { work_order_id: event.recipient } })) {
        localSkipped += 1;
        continue;
      }
      const payload = (event.payload && typeof event.payload === "object") ? event.payload : {};
      const updatedById = payload.updatedById
        ? String(payload.updatedById)
        : (await prisma.user.findFirst({ where: { company_id: event.company_id, status: "active" }, select: { id: true } }))?.id;
      if (!updatedById) { localSkipped += 1; continue; }
      await prisma.workOrderProfitabilitySettings.create({
        data: {
          company_id: event.company_id,
          work_order_id: event.recipient,
          internal_hourly_cost: num(payload.internalHourlyCost, 350),
          customer_hourly_rate: num(payload.customerHourlyRate, 650),
          material_markup_percent: num(payload.materialMarkupPercent, 15),
          other_cost: num(payload.otherCost),
          fixed_revenue: num(payload.fixedRevenue),
          updated_by_id: updatedById,
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

  await backfill("WorkOrderInvoiceDraft", async () => {
    const events = await fetchAll(
      (args) => prisma.integrationEvent.findMany(args),
      { type: "work_order.invoice_basis", company_id: { not: null }, recipient: { not: null } },
      { created_at: "asc" },
      1000,
      "WorkOrderInvoiceDraft",
    );
    let localCreated = 0;
    let localSkipped = 0;
    for (const event of events) {
      const payload = (event.payload && typeof event.payload === "object") ? event.payload : null;
      if (!payload?.versionId || !event.company_id || !event.recipient) { localSkipped += 1; continue; }
      if (await prisma.workOrderInvoiceDraft.findUnique({ where: { version_id: String(payload.versionId) } })) {
        localSkipped += 1;
        continue;
      }
      const updatedById = payload.updatedById
        ? String(payload.updatedById)
        : (await prisma.user.findFirst({ where: { company_id: event.company_id, status: "active" }, select: { id: true } }))?.id;
      if (!updatedById) { localSkipped += 1; continue; }
      await prisma.workOrderInvoiceDraft.create({
        data: {
          company_id: event.company_id,
          work_order_id: event.recipient,
          version_id: String(payload.versionId),
          status: String(payload.status || "draft"),
          customer_name: String(payload.customerName || ""),
          customer_org_number: String(payload.customerOrgNumber || ""),
          customer_reference: String(payload.customerReference || ""),
          invoice_date: String(payload.invoiceDate || event.created_at.toISOString().slice(0, 10)),
          due_days: num(payload.dueDays, 30),
          discount_percent: num(payload.discountPercent),
          vat_percent: num(payload.vatPercent, 25),
          note: String(payload.note || ""),
          lines: Array.isArray(payload.lines) ? payload.lines : [],
          subtotal: num(payload.subtotal),
          discount: num(payload.discount),
          net: num(payload.net),
          vat: num(payload.vat),
          total: num(payload.total),
          updated_by_id: updatedById,
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

  await backfill("WorkOrderInvoiceExportJob", async () => {
    const events = await fetchAll(
      (args) => prisma.integrationEvent.findMany(args),
      { type: "work_order.invoice_integration_job", company_id: { not: null }, recipient: { not: null } },
      { created_at: "asc" },
      1000,
      "WorkOrderInvoiceExportJob",
    );
    let localCreated = 0;
    let localSkipped = 0;
    const latest = new Map();
    for (const event of events) {
      const payload = (event.payload && typeof event.payload === "object") ? event.payload : null;
      if (!payload?.jobId || !event.company_id || !event.recipient) { localSkipped += 1; continue; }
      latest.set(`${event.company_id}:${payload.jobId}`, { event, payload });
    }
    for (const { event, payload } of latest.values()) {
      if (await prisma.workOrderInvoiceExportJob.findUnique({ where: { id: String(payload.jobId) } })) {
        localSkipped += 1;
        continue;
      }
      const createdById = payload.createdById
        ? String(payload.createdById)
        : (await prisma.user.findFirst({ where: { company_id: event.company_id, status: "active" }, select: { id: true } }))?.id;
      if (!createdById || !payload.invoiceVersionId) { localSkipped += 1; continue; }
      await prisma.workOrderInvoiceExportJob.create({
        data: {
          id: String(payload.jobId),
          company_id: event.company_id,
          work_order_id: event.recipient,
          provider: String(payload.provider || "webhook"),
          status: String(payload.status || "queued"),
          attempt: Math.max(1, num(payload.attempt, 1)),
          invoice_version_id: String(payload.invoiceVersionId),
          error: payload.error ? String(payload.error) : null,
          provider_status: payload.providerStatus == null ? null : num(payload.providerStatus),
          external_id: payload.externalId ? String(payload.externalId) : null,
          provider_response: payload.providerResponse ? String(payload.providerResponse) : null,
          processing_started_at: dateOrNull(payload.processingStartedAt),
          sent_at: dateOrNull(payload.sentAt),
          failed_at: dateOrNull(payload.failedAt),
          created_by_id: createdById,
          acted_by_id: payload.actedById ? String(payload.actedById) : null,
          created_at: dateOrNull(payload.createdAt) || event.created_at,
          updated_at: dateOrNull(payload.updatedAt) || event.created_at,
        },
      });
      localCreated += 1;
    }
    created += localCreated;
    skipped += localSkipped;
    return { created: localCreated, skipped: localSkipped };
  });

  await backfill("NotificationUxState", async () => {
    const channelByType = {
      service_notification_read: "service_center",
      work_order_sla_notification_read: "work_order_sla",
      work_order_lock_notification_read: "work_order_lock",
      recurring_notification_read: "recurring",
    };
    const readEvents = await fetchAll(
      (args) => prisma.integrationEvent.findMany(args),
      {
        type: { in: Object.keys(channelByType) },
        company_id: { not: null },
        recipient: { not: null },
        status: "read",
      },
      { created_at: "asc" },
      1000,
      "NotificationUxState",
    );
    let localCreated = 0;
    let localSkipped = 0;
    for (const event of readEvents) {
      const payload = (event.payload && typeof event.payload === "object") ? event.payload : {};
      const key = payload.notificationKey ? String(payload.notificationKey) : "";
      if (!event.company_id || !event.recipient || !key) { localSkipped += 1; continue; }
      const channel = channelByType[event.type];
      if (!channel) { localSkipped += 1; continue; }
      const existing = await prisma.notificationUxState.findUnique({
        where: { company_id_user_id_channel_notification_key: { company_id: event.company_id, user_id: event.recipient, channel, notification_key: key } },
      });
      if (existing?.read_at) { localSkipped += 1; continue; }
      if (existing) {
        await prisma.notificationUxState.update({ where: { id: existing.id }, data: { read_at: event.created_at } });
        localCreated += 1;
        continue;
      }
      await prisma.notificationUxState.create({
        data: {
          company_id: event.company_id,
          user_id: event.recipient,
          channel,
          notification_key: key,
          read_at: event.created_at,
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

  await backfill("ServiceEscalationRulesSettings", async () => {
    const events = await fetchAll(
      (args) => prisma.integrationEvent.findMany(args),
      { type: "service_escalation_rules", status: "active", company_id: { not: null } },
      { created_at: "desc" },
      1000,
      "events",
    );
    let localCreated = 0;
    let localSkipped = 0;
    const seen = new Set();
    for (const event of events) {
      if (!event.company_id || seen.has(event.company_id)) { localSkipped += 1; continue; }
      seen.add(event.company_id);
      if (await prisma.serviceEscalationRulesSettings.findUnique({ where: { company_id: event.company_id } })) {
        localSkipped += 1; continue;
      }
      const payload = (event.payload && typeof event.payload === "object") ? event.payload : {};
      const rules = (payload.rules && typeof payload.rules === "object") ? payload.rules : payload;
      const updatedById = payload.changedBy
        ? String(payload.changedBy)
        : (await prisma.user.findFirst({ where: { company_id: event.company_id, status: "active" }, select: { id: true } }))?.id;
      if (!updatedById) { localSkipped += 1; continue; }
      const roles = Array.isArray(rules.recipientRoles) ? rules.recipientRoles.map(String) : ["owner", "admin"];
      await prisma.serviceEscalationRulesSettings.create({
        data: {
          company_id: event.company_id,
          enabled: rules.enabled !== false,
          escalate_blocked: rules.escalateBlocked !== false,
          escalate_overdue: rules.escalateOverdue !== false,
          grace_days: num(rules.graceDays, 0),
          repeat_days: Math.max(1, num(rules.repeatDays, 1)),
          recipient_roles: roles,
          include_assignee: rules.includeAssignee !== false,
          updated_by_id: updatedById,
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

  await backfill("ServiceNotificationAssignment", async () => {
    const events = await prisma.integrationEvent.findMany({
      where: { type: "service_notification_assignment", company_id: { not: null } },
      orderBy: { created_at: "desc" },
      take: 10000,
    });
    let localCreated = 0;
    let localSkipped = 0;
    const seen = new Set();
    for (const event of events) {
      const payload = (event.payload && typeof event.payload === "object") ? event.payload : null;
      const key = payload?.notificationKey ? String(payload.notificationKey) : "";
      if (!event.company_id || !key || seen.has(`${event.company_id}:${key}`)) { localSkipped += 1; continue; }
      seen.add(`${event.company_id}:${key}`);
      const existing = await prisma.serviceNotificationAssignment.findUnique({
        where: { company_id_notification_key: { company_id: event.company_id, notification_key: key } },
      });
      if (existing) { localSkipped += 1; continue; }
      const changedById = payload.changedBy
        ? String(payload.changedBy)
        : (await prisma.user.findFirst({ where: { company_id: event.company_id, status: "active" }, select: { id: true } }))?.id;
      if (!changedById) { localSkipped += 1; continue; }
      const assetId = key.startsWith("component-service:") ? key.split(":")[1] || null : null;
      await prisma.serviceNotificationAssignment.create({
        data: {
          company_id: event.company_id,
          notification_key: key,
          asset_id: assetId,
          assignee_user_id: payload.assigneeId ? String(payload.assigneeId) : null,
          assignee_name: payload.assigneeName ? String(payload.assigneeName) : null,
          status: String(payload.status || "assigned"),
          deadline_at: dateOrNull(payload.deadline),
          note: payload.note ? String(payload.note) : null,
          changed_by_id: changedById,
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

  await backfill("ComponentServiceDigestRun", async () => {
    const events = await prisma.integrationEvent.findMany({
      where: { type: "component_service_digest", company_id: { not: null }, recipient: { not: null } },
      orderBy: { created_at: "desc" },
      take: 10000,
    });
    let localCreated = 0;
    let localSkipped = 0;
    const seen = new Set();
    for (const event of events) {
      if (!event.company_id || !event.recipient || seen.has(`${event.company_id}:${event.recipient}`)) {
        localSkipped += 1;
        continue;
      }
      seen.add(`${event.company_id}:${event.recipient}`);
      const existing = await prisma.componentServiceDigestRun.findUnique({
        where: { company_id_dedupe_key: { company_id: event.company_id, dedupe_key: event.recipient } },
      });
      if (existing) { localSkipped += 1; continue; }
      const payload = (event.payload && typeof event.payload === "object") ? event.payload : {};
      const delivery = (payload.deliverySummary && typeof payload.deliverySummary === "object") ? payload.deliverySummary : {};
      await prisma.componentServiceDigestRun.create({
        data: {
          id: event.id,
          company_id: event.company_id,
          dedupe_key: event.recipient,
          status: String(event.status || "processing"),
          payload,
          sent_count: num(delivery.sent),
          failed_count: num(delivery.failed),
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

  await backfill("ComponentServiceDeliveryAlert", async () => {
    const events = await fetchAll(
      (args) => prisma.integrationEvent.findMany(args),
      { type: "component_service_delivery_alert", company_id: { not: null } },
      { created_at: "asc" },
      1000,
      "events",
    );
    let localCreated = 0;
    let localSkipped = 0;
    for (const event of events) {
      if (!event.company_id) { localSkipped += 1; continue; }
      if (await prisma.componentServiceDeliveryAlert.findUnique({ where: { id: event.id } })) {
        localSkipped += 1;
        continue;
      }
      const payload = (event.payload && typeof event.payload === "object") ? event.payload : {};
      const sourceRunId = payload.sourceEventId ? String(payload.sourceEventId) : null;
      const sourceExists = sourceRunId
        ? await prisma.componentServiceDigestRun.findUnique({ where: { id: sourceRunId }, select: { id: true } })
        : null;
      await prisma.componentServiceDeliveryAlert.create({
        data: {
          id: event.id,
          company_id: event.company_id,
          source_run_id: sourceExists ? sourceRunId : null,
          status: event.status === "resolved" ? "resolved" : "open",
          severity: String(payload.severity || "warning") === "critical" ? "critical" : "warning",
          sent_count: num(payload.sentCount),
          failed_count: num(payload.failedCount),
          dedupe_key: payload.dedupeKey ? String(payload.dedupeKey) : null,
          created_at: event.created_at,
          resolved_at: event.status === "resolved" ? event.created_at : null,
        },
      });
      localCreated += 1;
    }
    created += localCreated;
    skipped += localSkipped;
    return { created: localCreated, skipped: localSkipped };
  });

  await backfill("ServiceNotificationSettings", async () => {
    const events = await fetchAll(
      (args) => prisma.integrationEvent.findMany(args),
      { type: "component_service_settings", status: "active", company_id: { not: null } },
      { created_at: "desc" },
      1000,
      "events",
    );
    let localCreated = 0;
    let localSkipped = 0;
    const seen = new Set();
    for (const event of events) {
      if (!event.company_id || seen.has(event.company_id)) { localSkipped += 1; continue; }
      seen.add(event.company_id);
      const existing = await prisma.serviceNotificationSettings.findUnique({ where: { company_id: event.company_id } });
      if (existing) { localSkipped += 1; continue; }
      const payload = (event.payload && typeof event.payload === "object") ? event.payload : {};
      const roles = Array.isArray(payload.roles) ? payload.roles.map(String) : ["owner", "admin", "manager", "property_manager"];
      const additionalEmails = Array.isArray(payload.additionalEmails) ? payload.additionalEmails.map(String) : [];
      const daysAhead = Number(payload.daysAhead);
      const updatedById = payload.updatedBy ? String(payload.updatedBy) : null;
      const actor = updatedById
        || (await prisma.user.findFirst({ where: { company_id: event.company_id, status: "active" }, orderBy: { created_at: "asc" }, select: { id: true } }))?.id;
      if (!actor) { localSkipped += 1; continue; }
      await prisma.serviceNotificationSettings.create({
        data: {
          company_id: event.company_id,
          enabled: payload.enabled !== false,
          days_ahead: Number.isInteger(daysAhead) && daysAhead >= 1 && daysAhead <= 90 ? daysAhead : 30,
          roles,
          additional_emails: additionalEmails,
          updated_by_id: actor,
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

  await backfill("UserServiceNotificationPreference", async () => {
    const events = await fetchAll(
      (args) => prisma.integrationEvent.findMany(args),
      {
        type: "user_service_notification_preferences",
        status: "active",
        company_id: { not: null },
        recipient: { not: null },
      },
      { created_at: "desc" },
      1000,
      "events",
    );
    let localCreated = 0;
    let localSkipped = 0;
    const seen = new Set();
    for (const event of events) {
      const key = `${event.company_id}:${event.recipient}`;
      if (!event.company_id || !event.recipient || seen.has(key)) { localSkipped += 1; continue; }
      seen.add(key);
      const existing = await prisma.userServiceNotificationPreference.findUnique({
        where: { company_id_user_id: { company_id: event.company_id, user_id: event.recipient } },
      });
      if (existing) { localSkipped += 1; continue; }
      const user = await prisma.user.findFirst({
        where: { id: event.recipient, company_id: event.company_id },
        select: { id: true },
      });
      if (!user) { localSkipped += 1; continue; }
      const payload = (event.payload && typeof event.payload === "object") ? event.payload : {};
      await prisma.userServiceNotificationPreference.create({
        data: {
          company_id: event.company_id,
          user_id: event.recipient,
          enabled: payload.enabled !== false,
          overdue_only: payload.overdueOnly === true,
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

  await backfill("RecurringWorkOrderSchedule", async () => {
    const logs = await fetchAll(
      (args) => prisma.auditLog.findMany(args),
      { action: "work_order.recurring.schedule", company_id: { not: null } },
      { created_at: "asc" },
      1000,
      "RecurringWorkOrderSchedule",
    );
    let localCreated = 0;
    let localSkipped = 0;
    const latest = new Map();
    for (const log of logs) {
      const metadata = (log.metadata && typeof log.metadata === "object") ? log.metadata : {};
      const id = metadata.schedule_id || log.entity_id || log.id;
      if (!log.company_id || !id) { localSkipped += 1; continue; }
      latest.set(`${log.company_id}:${id}`, { log, metadata, id });
    }
    for (const { log, metadata, id } of latest.values()) {
      if (await prisma.recurringWorkOrderSchedule.findUnique({ where: { id } })) {
        localSkipped += 1;
        continue;
      }
      if (!metadata.property_id || !metadata.title || !metadata.description || !metadata.frequency || !metadata.next_run_at) {
        localSkipped += 1;
        continue;
      }
      await prisma.recurringWorkOrderSchedule.create({
        data: {
          id,
          company_id: log.company_id,
          property_id: String(metadata.property_id),
          property_name: String(metadata.property_name || ""),
          title: String(metadata.title),
          description: String(metadata.description),
          frequency: String(metadata.frequency),
          priority: String(metadata.priority || "normal"),
          estimated_cost: metadata.estimated_cost == null || metadata.estimated_cost === "" ? null : num(metadata.estimated_cost),
          next_run_at: new Date(String(metadata.next_run_at)),
          active: metadata.active !== false,
          last_generated_at: dateOrNull(metadata.last_generated_at),
          last_work_order_id: metadata.last_work_order_id ? String(metadata.last_work_order_id) : null,
          last_work_order_number: metadata.last_work_order_number ? String(metadata.last_work_order_number) : null,
          created_by_id: log.actor_user_id || null,
          updated_by_id: log.actor_user_id || null,
          created_at: log.created_at,
          updated_at: dateOrNull(metadata.updated_at) || log.created_at,
        },
      });
      localCreated += 1;
    }
    created += localCreated;
    skipped += localSkipped;
    return { created: localCreated, skipped: localSkipped };
  });

  await backfill("RecurringWorkOrderRun", async () => {
    const events = await fetchAll(
      (args) => prisma.integrationEvent.findMany(args),
      { type: "recurring_work_orders_run" },
      { created_at: "asc" },
      1000,
      "RecurringWorkOrderRun",
    );
    let localCreated = 0;
    let localSkipped = 0;
    for (const event of events) {
      if (await prisma.recurringWorkOrderRun.findUnique({ where: { id: event.id } })) {
        localSkipped += 1;
        continue;
      }
      await prisma.recurringWorkOrderRun.create({
        data: {
          id: event.id,
          company_id: event.company_id,
          status: String(event.status || "processing"),
          recipient: event.recipient,
          payload: event.payload ?? undefined,
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

  await backfill("RecurringIncidentEvent", async () => {
    const typeMap = {
      recurring_work_order_incident: "status",
      recurring_incident_escalation: "escalation",
      recurring_incident_assignment: "assignment",
      recurring_incident_sla: "sla",
    };
    const events = await fetchAll(
      (args) => prisma.integrationEvent.findMany(args),
      { type: { in: Object.keys(typeMap) }, company_id: { not: null } },
      { created_at: "asc" },
      1000,
      "RecurringIncidentEvent",
    );
    let localCreated = 0;
    let localSkipped = 0;
    for (const event of events) {
      if (!event.company_id) { localSkipped += 1; continue; }
      if (await prisma.recurringIncidentEvent.findUnique({ where: { id: event.id } })) {
        localSkipped += 1;
        continue;
      }
      const payload = (event.payload && typeof event.payload === "object") ? event.payload : {};
      const key = payload.notificationKey ? String(payload.notificationKey) : "";
      if (!key) { localSkipped += 1; continue; }
      await prisma.recurringIncidentEvent.create({
        data: {
          id: event.id,
          company_id: event.company_id,
          notification_key: key,
          event_type: typeMap[event.type],
          status: String(event.status || "open"),
          recipient: event.recipient,
          payload: event.payload ?? {},
          created_at: event.created_at,
        },
      });
      localCreated += 1;
    }
    created += localCreated;
    skipped += localSkipped;
    return { created: localCreated, skipped: localSkipped };
  });

  await backfill("VendorContract", async () => {
    const logs = await fetchAll(
      (args) => prisma.auditLog.findMany(args),
      { entity_type: "vendor_contract", company_id: { not: null } },
      { created_at: "asc" },
      1000,
      "logs",
    );
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

  await backfill("AccessCredential", async () => {
    const logs = await fetchAll(
      (args) => prisma.auditLog.findMany(args),
      { action: "access.credential.created", company_id: { not: null } },
      { created_at: "asc" },
      1000,
      "AccessCredential",
    );
    let localCreated = 0;
    let localSkipped = 0;
    for (const log of logs) {
      const metadata = (log.metadata && typeof log.metadata === "object") ? log.metadata : {};
      if (metadata.storage === "AccessCredential") { localSkipped += 1; continue; }
      if (!log.company_id || !log.actor_user_id || !log.entity_id || !metadata.identifier) {
        localSkipped += 1;
        continue;
      }
      if (await prisma.accessCredential.findUnique({ where: { id: log.id } })) {
        localSkipped += 1;
        continue;
      }
      const property = await prisma.property.findFirst({
        where: { id: log.entity_id, company_id: log.company_id },
        select: { id: true },
      });
      if (!property) { localSkipped += 1; continue; }
      await prisma.accessCredential.create({
        data: {
          id: log.id,
          company_id: log.company_id,
          property_id: property.id,
          identifier: String(metadata.identifier),
          credential_type: String(metadata.credential_type || "key"),
          holder: metadata.holder ? String(metadata.holder) : null,
          unit: metadata.unit ? String(metadata.unit) : null,
          access_area: metadata.access_area ? String(metadata.access_area) : null,
          status: String(metadata.status || "in_stock"),
          issued_at: dateOrNull(metadata.issued_at),
          return_due: dateOrNull(metadata.return_due),
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

  await backfill("InspectionRound", async () => {
    const logs = await fetchAll(
      (args) => prisma.auditLog.findMany(args),
      {
        company_id: { not: null },
        OR: [
          { action: "round.created" },
          { entity_type: "round" },
        ],
      },
      { created_at: "asc" },
      1000,
      "InspectionRound",
    );
    let localCreated = 0;
    let localSkipped = 0;
    for (const log of logs) {
      const metadata = (log.metadata && typeof log.metadata === "object") ? log.metadata : {};
      if (metadata.storage === "InspectionRound") { localSkipped += 1; continue; }
      const propertyId = metadata.propertyId || metadata.property_id;
      const title = metadata.title;
      const isRoundCreated = log.action === "round.created";
      if (!isRoundCreated && !(title && propertyId)) { localSkipped += 1; continue; }
      if (!log.company_id || !log.actor_user_id || !title || !propertyId) {
        localSkipped += 1;
        continue;
      }
      const nextDue = dateOrNull(metadata.nextDue || metadata.next_due);
      if (!nextDue) { localSkipped += 1; continue; }
      if (log.entity_id && await prisma.inspectionRound.findUnique({ where: { id: log.entity_id } })) {
        localSkipped += 1;
        continue;
      }
      if (await prisma.inspectionRound.findUnique({ where: { id: log.id } })) {
        localSkipped += 1;
        continue;
      }
      const property = await prisma.property.findFirst({
        where: { id: String(propertyId), company_id: log.company_id },
        select: { id: true },
      });
      if (!property) { localSkipped += 1; continue; }
      const checklist = metadata.checklist === undefined || metadata.checklist === null
        ? []
        : metadata.checklist;
      await prisma.inspectionRound.create({
        data: {
          id: log.id,
          company_id: log.company_id,
          property_id: property.id,
          title: String(title),
          interval: String(metadata.interval || "monthly"),
          status: String(metadata.status || "planned"),
          next_due: nextDue,
          checklist,
          deviations: num(metadata.deviations, 0),
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

  await backfill("QuoteDecision", async () => {
    const logs = await fetchAll(
      (args) => prisma.auditLog.findMany(args),
      { action: "quote.status_changed", company_id: { not: null } },
      { created_at: "asc" },
      1000,
      "QuoteDecision",
    );
    let localCreated = 0;
    let localSkipped = 0;
    for (const log of logs) {
      const metadata = (log.metadata && typeof log.metadata === "object") ? log.metadata : {};
      if (metadata.storage === "QuoteDecision") { localSkipped += 1; continue; }
      if (!log.company_id || !log.actor_user_id) { localSkipped += 1; continue; }
      const quoteId = metadata.quoteId || metadata.quote_id || log.entity_id;
      if (!quoteId) { localSkipped += 1; continue; }
      if (await prisma.quoteDecision.findUnique({ where: { id: log.id } })) {
        localSkipped += 1;
        continue;
      }
      const quote = await prisma.quote.findFirst({
        where: { id: String(quoteId), company_id: log.company_id },
        select: { id: true },
      });
      if (!quote) { localSkipped += 1; continue; }
      const comment = metadata.comment ?? metadata.decision_comment;
      await prisma.quoteDecision.create({
        data: {
          id: log.id,
          company_id: log.company_id,
          quote_id: quote.id,
          previous_status: String(metadata.previous_status || metadata.previousStatus || "draft"),
          status: String(metadata.status || metadata.new_status || "draft"),
          comment: comment ? String(comment) : null,
          actor_user_id: log.actor_user_id,
          created_at: log.created_at,
        },
      });
      localCreated += 1;
    }
    created += localCreated;
    skipped += localSkipped;
    return { created: localCreated, skipped: localSkipped };
  });

  await backfill("WorkOrderLockNotification", async () => {
    const events = await fetchAll(
      (args) => prisma.integrationEvent.findMany(args),
      { type: "work_order_edit_lock_forced_release", company_id: { not: null }, recipient: { not: null } },
      { created_at: "asc" },
      1000,
      "WorkOrderLockNotification",
    );
    let localCreated = 0;
    let localSkipped = 0;
    for (const event of events) {
      const payload = (event.payload && typeof event.payload === "object") ? event.payload : {};
      const key = payload.notificationKey ? String(payload.notificationKey) : "";
      const workOrderId = payload.workOrderId ? String(payload.workOrderId) : "";
      const releasedById = payload.releasedById ? String(payload.releasedById) : "";
      if (!event.company_id || !event.recipient || !key || !workOrderId || !releasedById) {
        localSkipped += 1;
        continue;
      }
      if (await prisma.workOrderLockNotification.findUnique({
        where: { company_id_notification_key: { company_id: event.company_id, notification_key: key } },
      })) {
        localSkipped += 1;
        continue;
      }
      const workOrder = await prisma.workOrder.findFirst({
        where: { id: workOrderId, company_id: event.company_id },
        select: { id: true },
      });
      const recipient = await prisma.user.findFirst({
        where: { id: event.recipient, company_id: event.company_id },
        select: { id: true },
      });
      const releasedBy = await prisma.user.findFirst({
        where: { id: releasedById },
        select: { id: true },
      });
      if (!workOrder || !recipient || !releasedBy) { localSkipped += 1; continue; }
      await prisma.workOrderLockNotification.create({
        data: {
          id: event.id,
          company_id: event.company_id,
          work_order_id: workOrderId,
          recipient_user_id: event.recipient,
          notification_key: key,
          title: String(payload.title || "Ditt redigeringslås frigjordes"),
          description: String(payload.description || ""),
          href: String(payload.href || `/dashboard/arbetsorder/${workOrderId}`),
          high: payload.high !== false,
          work_order_number: payload.workOrderNumber ? String(payload.workOrderNumber) : null,
          work_order_title: payload.workOrderTitle ? String(payload.workOrderTitle) : null,
          released_by_id: releasedById,
          released_by_name: payload.releasedByName ? String(payload.releasedByName) : null,
          reason: String(payload.reason || "Frigjort"),
          occurred_at: dateOrNull(payload.dueAt) || event.created_at,
          created_at: event.created_at,
        },
      });
      localCreated += 1;
    }
    created += localCreated;
    skipped += localSkipped;
    return { created: localCreated, skipped: localSkipped };
  });

  await backfill("ServiceAssignmentEscalation", async () => {
    const events = await fetchAll(
      (args) => prisma.integrationEvent.findMany(args),
      { type: "service_assignment_escalation", company_id: { not: null }, recipient: { not: null } },
      { created_at: "asc" },
      1000,
      "ServiceAssignmentEscalation",
    );
    let localCreated = 0;
    let localSkipped = 0;
    for (const event of events) {
      if (!event.company_id || !event.recipient) { localSkipped += 1; continue; }
      if (await prisma.serviceAssignmentEscalation.findUnique({
        where: { company_id_dedupe_key: { company_id: event.company_id, dedupe_key: event.recipient } },
      })) {
        localSkipped += 1;
        continue;
      }
      const payload = (event.payload && typeof event.payload === "object") ? event.payload : {};
      await prisma.serviceAssignmentEscalation.create({
        data: {
          id: event.id,
          company_id: event.company_id,
          dedupe_key: event.recipient,
          notification_key: payload.notificationKey ? String(payload.notificationKey) : event.recipient,
          status: String(event.status || "processing"),
          reason: payload.reason ? String(payload.reason) : "unknown",
          payload: event.payload ?? {},
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

  await backfill("ServiceEscalationAdminAction", async () => {
    const events = await fetchAll(
      (args) => prisma.integrationEvent.findMany(args),
      { type: "service_escalation_admin_action", company_id: { not: null } },
      { created_at: "asc" },
      1000,
      "events",
    );
    let localCreated = 0;
    let localSkipped = 0;
    for (const event of events) {
      if (!event.company_id) { localSkipped += 1; continue; }
      if (await prisma.serviceEscalationAdminAction.findUnique({ where: { id: event.id } })) {
        localSkipped += 1;
        continue;
      }
      const payload = (event.payload && typeof event.payload === "object") ? event.payload : {};
      const requestedById = payload.requestedBy
        ? String(payload.requestedBy)
        : (await prisma.user.findFirst({ where: { company_id: event.company_id, status: "active" }, select: { id: true } }))?.id;
      if (!requestedById) { localSkipped += 1; continue; }
      await prisma.serviceEscalationAdminAction.create({
        data: {
          id: event.id,
          company_id: event.company_id,
          action: payload.action ? String(payload.action) : "retry",
          status: String(event.status || "processing"),
          requested_by_id: requestedById,
          requested_by_email: String(payload.requestedByEmail || event.recipient || ""),
          payload: event.payload ?? undefined,
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

  await backfill("NotificationRead", async () => {
    const logs = await fetchAll(
      (args) => prisma.auditLog.findMany(args),
      { action: "notification.read", company_id: { not: null } },
      { created_at: "asc" },
      1000,
      "NotificationRead",
    );
    let localCreated = 0;
    let localSkipped = 0;
    for (const log of logs) {
      const metadata = (log.metadata && typeof log.metadata === "object") ? log.metadata : {};
      const readerId = metadata.reader_id ? String(metadata.reader_id) : "";
      const notificationId = log.entity_id ? String(log.entity_id) : "";
      if (!log.company_id || !readerId || !notificationId) { localSkipped += 1; continue; }
      const notification = await prisma.appNotification.findFirst({
        where: { id: notificationId, company_id: log.company_id },
        select: { id: true },
      });
      if (!notification) { localSkipped += 1; continue; }
      const existing = await prisma.notificationRead.findUnique({
        where: { notification_id_reader_user_id: { notification_id: notificationId, reader_user_id: readerId } },
        select: { id: true },
      });
      if (existing) { localSkipped += 1; continue; }
      await prisma.notificationRead.create({
        data: {
          company_id: log.company_id,
          notification_id: notificationId,
          reader_user_id: readerId,
          read_at: log.created_at,
        },
      });
      localCreated += 1;
    }
    created += localCreated;
    skipped += localSkipped;
    return { created: localCreated, skipped: localSkipped };
  });

  await backfill("ComponentServiceDeliveryAlertAck", async () => {
    const events = await fetchAll(
      (args) => prisma.integrationEvent.findMany(args),
      { type: "component_service_delivery_alert_acknowledgement", company_id: { not: null }, recipient: { not: null } },
      { created_at: "asc" },
      1000,
      "ComponentServiceDeliveryAlertAck",
    );
    let localCreated = 0;
    let localSkipped = 0;
    for (const event of events) {
      const payload = (event.payload && typeof event.payload === "object") ? event.payload : {};
      const alertId = payload.alertId ? String(payload.alertId) : "";
      const userId = event.recipient ? String(event.recipient) : "";
      if (!event.company_id || !alertId || !userId) { localSkipped += 1; continue; }
      const alert = await prisma.componentServiceDeliveryAlert.findFirst({
        where: { id: alertId, company_id: event.company_id },
        select: { id: true },
      });
      if (!alert) { localSkipped += 1; continue; }
      const existing = await prisma.componentServiceDeliveryAlertAck.findUnique({
        where: { alert_id_user_id: { alert_id: alertId, user_id: userId } },
        select: { id: true },
      });
      if (existing) { localSkipped += 1; continue; }
      await prisma.componentServiceDeliveryAlertAck.create({
        data: {
          id: event.id,
          company_id: event.company_id,
          alert_id: alertId,
          user_id: userId,
          created_at: event.created_at,
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
