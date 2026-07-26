import { Prisma } from "@prisma/client";
import db from "@/lib/db";
import {
  addWorkOrderStatusEvent,
  allocateWorkOrderNumber,
  calculateWorkOrderSla,
  setWorkOrderEnterpriseFields,
} from "@/lib/work-order-enterprise-core";
import { setWorkOrderAssetLinks } from "@/lib/work-order-asset-links";
import type { WorkOrderPriority } from "@/lib/work-order-workflow";

type Candidate = {
  id: string;
  company_id: string;
  property_id: string;
  building_id: string | null;
  name: string;
  category: string | null;
  location: string | null;
  criticality: string | null;
  next_service_at: Date;
  service_lead_days: number;
  property_name: string;
};

type Actor = { id: string };

export type PreventiveMaintenanceResult = {
  examined: number;
  created: number;
  skipped: number;
  failed: number;
  workOrderIds: string[];
  errors: Array<{ componentId: string; message: string }>;
};

export function maintenancePriority(criticality: string | null): WorkOrderPriority {
  if (criticality === "critical") return "urgent";
  if (criticality === "high") return "high";
  if (criticality === "low") return "low";
  return "normal";
}

export function maintenanceCycleKey(componentId: string, serviceDate: Date) {
  return `component-service:${componentId}:${serviceDate.toISOString().slice(0, 10)}`;
}

function serviceWindowEnd(now: Date, days: number) {
  return new Date(now.getTime() + days * 86_400_000);
}

async function loadCandidates(now: Date, companyId?: string) {
  const maxWindow = serviceWindowEnd(now, 90);
  return db.$queryRaw<Candidate[]>(Prisma.sql`
    SELECT a."id", a."company_id", a."property_id", a."building_id", a."name", a."category", a."location",
           a."criticality", a."next_service_at", a."service_lead_days", p."name" AS "property_name"
    FROM "PropertyTechnicalAsset" a
    INNER JOIN "Property" p ON p."id" = a."property_id" AND p."company_id" = a."company_id"
    WHERE a."next_service_at" IS NOT NULL
      AND a."next_service_at" <= ${maxWindow}
      AND a."auto_create_service_work_orders" = TRUE
      AND COALESCE(a."status", 'active') IN ('active', 'planned')
      AND (${companyId ?? null}::text IS NULL OR a."company_id" = ${companyId ?? null})
    ORDER BY a."company_id", a."next_service_at" ASC, a."criticality" DESC
  `);
}

async function actorForCompany(companyId: string) {
  return db.user.findFirst({
    where: {
      company_id: companyId,
      status: "active",
      role: { in: ["owner", "admin", "manager", "property_manager"] },
    },
    orderBy: [{ created_at: "asc" }],
    select: { id: true },
  }) as Promise<Actor | null>;
}

export async function runPreventiveMaintenanceEngine(options: { companyId?: string; now?: Date } = {}) {
  const now = options.now ?? new Date();
  const candidates = await loadCandidates(now, options.companyId);
  const result: PreventiveMaintenanceResult = {
    examined: candidates.length,
    created: 0,
    skipped: 0,
    failed: 0,
    workOrderIds: [],
    errors: [],
  };
  const actorCache = new Map<string, Actor | null>();

  for (const component of candidates) {
    if (component.next_service_at > serviceWindowEnd(now, Math.max(1, Math.min(component.service_lead_days || 30, 90)))) {
      result.skipped += 1;
      continue;
    }

    let actor = actorCache.get(component.company_id);
    if (actor === undefined) {
      actor = await actorForCompany(component.company_id);
      actorCache.set(component.company_id, actor);
    }
    if (!actor) {
      result.failed += 1;
      result.errors.push({ componentId: component.id, message: "Organisationen saknar aktiv administrativ användare" });
      continue;
    }

    const cycleKey = maintenanceCycleKey(component.id, component.next_service_at);
    const priority = maintenancePriority(component.criticality);
    const createdAt = now;
    const sla = calculateWorkOrderSla(createdAt, priority);

    try {
      const created = await db.$transaction(async (tx) => {
        await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`${component.company_id}:${cycleKey}`}))`);
        const existing = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT "id" FROM "WorkOrder"
          WHERE "company_id" = ${component.company_id} AND "maintenance_cycle_key" = ${cycleKey}
            AND "deleted_at" IS NULL
          LIMIT 1
        `);
        if (existing[0]) return { id: existing[0].id, wasCreated: false };

        const workOrderNumber = await allocateWorkOrderNumber(tx, component.company_id, createdAt);
        const title = `Förebyggande service – ${component.name}`;
        const context = [component.category, component.location, component.property_name].filter(Boolean).join(" · ");
        const description = `Planerad förebyggande service för ${component.name}.${context ? `\n\nTeknisk kontext: ${context}.` : ""}\n\nService ska utföras senast ${component.next_service_at.toISOString().slice(0, 10)}.`;
        const scheduledStart = component.next_service_at;
        const scheduledEnd = new Date(scheduledStart.getTime() + 60 * 60 * 1000);

        const workOrder = await tx.workOrder.create({
          data: {
            company_id: component.company_id,
            property_id: component.property_id,
            created_by_id: actor!.id,
            title,
            description,
            status: "planned",
            priority,
            scheduled_start: scheduledStart,
            scheduled_end: scheduledEnd,
            created_at: createdAt,
          },
        });

        await setWorkOrderEnterpriseFields(tx, {
          workOrderId: workOrder.id,
          companyId: component.company_id,
          workOrderNumber,
          workType: "preventive",
          source: "maintenance_plan",
          responseDueAt: sla.responseDueAt,
          resolutionDueAt: sla.resolutionDueAt,
        });
        await setWorkOrderAssetLinks(tx, {
          workOrderId: workOrder.id,
          companyId: component.company_id,
          buildingId: component.building_id,
          technicalAssetId: component.id,
        });
        await tx.$executeRaw(Prisma.sql`
          UPDATE "WorkOrder"
          SET "maintenance_cycle_key" = ${cycleKey}
          WHERE "id" = ${workOrder.id} AND "company_id" = ${component.company_id}
        `);
        await addWorkOrderStatusEvent(tx, {
          companyId: component.company_id,
          workOrderId: workOrder.id,
          actorUserId: actor!.id,
          fromStatus: null,
          toStatus: "planned",
          reason: "Automatiskt skapad från komponentens serviceplan",
          metadata: {
            workOrderNumber,
            cycleKey,
            technicalAssetId: component.id,
            buildingId: component.building_id,
            serviceDueAt: component.next_service_at.toISOString(),
            priority,
          },
        });
        return { id: workOrder.id, wasCreated: true };
      });

      if (created.wasCreated) {
        result.created += 1;
        result.workOrderIds.push(created.id);
      } else {
        result.skipped += 1;
      }
    } catch (error) {
      result.failed += 1;
      result.errors.push({ componentId: component.id, message: error instanceof Error ? error.message : "Okänt fel" });
    }
  }

  return result;
}
