import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

const EVENT_TYPE_BY_WORK_TYPE: Record<string, string> = {
  corrective: "repair",
  preventive: "service",
  inspection: "inspection",
  emergency: "repair",
  project: "replacement",
  warranty: "warranty",
};

const COST_TYPE_BY_WORK_TYPE: Record<string, string> = {
  corrective: "repair",
  preventive: "service",
  inspection: "inspection",
  emergency: "repair",
  project: "investment",
  warranty: "repair",
};

type MaintenanceCycleRow = {
  source: string;
  maintenance_cycle_key: string | null;
  maintenance_cycle_advanced_at: Date | null;
};

type AssetMaintenanceRow = {
  service_interval_months: number;
};

export function componentEventTypeForWorkOrder(workType: string) {
  return EVENT_TYPE_BY_WORK_TYPE[workType] || "repair";
}

export function componentCostTypeForWorkOrder(workType: string) {
  return COST_TYPE_BY_WORK_TYPE[workType] || "other";
}

export function parseMaintenanceCycleDate(cycleKey: string | null) {
  if (!cycleKey) return null;
  const match = cycleKey.match(/^component-service:[^:]+:(\d{4}-\d{2}-\d{2})$/);
  if (!match) return null;
  const date = new Date(`${match[1]}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function addServiceInterval(baseDate: Date, months: number) {
  const normalizedMonths = Number.isFinite(months) ? Math.trunc(months) : 12;
  const safeMonths = Math.max(1, Math.min(normalizedMonths, 120));
  const result = new Date(baseDate);
  const originalDay = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + safeMonths);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(originalDay, lastDay));
  return result;
}

async function advancePreventiveMaintenanceCycle(
  tx: Prisma.TransactionClient,
  args: { companyId: string; technicalAssetId: string; workOrderId: string; completedAt: Date },
) {
  const workOrders = await tx.$queryRaw<MaintenanceCycleRow[]>(Prisma.sql`
    SELECT "source", "maintenance_cycle_key", "maintenance_cycle_advanced_at"
    FROM "WorkOrder"
    WHERE "id" = ${args.workOrderId} AND "company_id" = ${args.companyId}
    LIMIT 1
    FOR UPDATE
  `);
  const workOrder = workOrders[0];
  if (!workOrder || workOrder.source !== "maintenance_plan" || !workOrder.maintenance_cycle_key || workOrder.maintenance_cycle_advanced_at) {
    return { maintenanceCycleAdvanced: false, nextServiceAt: null as Date | null };
  }

  const cycleDate = parseMaintenanceCycleDate(workOrder.maintenance_cycle_key);
  if (!cycleDate) return { maintenanceCycleAdvanced: false, nextServiceAt: null as Date | null };

  const assets = await tx.$queryRaw<AssetMaintenanceRow[]>(Prisma.sql`
    SELECT "service_interval_months"
    FROM "PropertyTechnicalAsset"
    WHERE "id" = ${args.technicalAssetId} AND "company_id" = ${args.companyId}
    LIMIT 1
    FOR UPDATE
  `);
  const asset = assets[0];
  if (!asset) return { maintenanceCycleAdvanced: false, nextServiceAt: null as Date | null };

  const nextServiceAt = addServiceInterval(cycleDate, asset.service_interval_months);
  await tx.$executeRaw(Prisma.sql`
    UPDATE "PropertyTechnicalAsset"
    SET "next_service_at" = ${nextServiceAt}, "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${args.technicalAssetId} AND "company_id" = ${args.companyId}
  `);
  await tx.$executeRaw(Prisma.sql`
    UPDATE "WorkOrder"
    SET "maintenance_cycle_advanced_at" = ${args.completedAt}
    WHERE "id" = ${args.workOrderId} AND "company_id" = ${args.companyId}
      AND "maintenance_cycle_advanced_at" IS NULL
  `);

  return { maintenanceCycleAdvanced: true, nextServiceAt };
}

export async function syncCompletedWorkOrderToComponent(
  tx: Prisma.TransactionClient,
  args: {
    companyId: string;
    propertyId: string;
    technicalAssetId: string | null;
    workOrderId: string;
    workOrderNumber: string | null;
    workType: string;
    title: string;
    description: string;
    actorUserId: string;
    completedAt: Date;
    actualCost: number | null;
  },
) {
  const lifecycleSyncKey = `work-order:${args.workOrderId}:completion`;
  const costSyncKey = `work-order:${args.workOrderId}:actual-cost`;

  if (!args.technicalAssetId) {
    await tx.$executeRaw(Prisma.sql`
      DELETE FROM "ComponentCostEntry"
      WHERE "company_id" = ${args.companyId} AND "sync_key" = ${costSyncKey}
    `);
    await tx.$executeRaw(Prisma.sql`
      DELETE FROM "ComponentLifecycleEvent"
      WHERE "company_id" = ${args.companyId} AND "sync_key" = ${lifecycleSyncKey}
    `);
    return { lifecycleSynced: false, costSynced: false, maintenanceCycleAdvanced: false, nextServiceAt: null as Date | null };
  }

  const reference = args.workOrderNumber || args.workOrderId;
  const eventType = componentEventTypeForWorkOrder(args.workType);
  const costType = componentCostTypeForWorkOrder(args.workType);

  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "ComponentLifecycleEvent"
      ("id", "company_id", "property_id", "technical_asset_id", "created_by_id", "work_order_id",
       "event_type", "event_date", "title", "description", "result", "sync_key", "created_at", "updated_at")
    VALUES
      (${randomUUID()}, ${args.companyId}, ${args.propertyId}, ${args.technicalAssetId}, ${args.actorUserId}, ${args.workOrderId},
       ${eventType}, ${args.completedAt}, ${`Arbetsorder slutförd – ${reference}`}, ${args.description},
       ${`Slutförd i Revalta: ${args.title}`}, ${lifecycleSyncKey}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("company_id", "sync_key") WHERE "sync_key" IS NOT NULL
    DO UPDATE SET
      "technical_asset_id" = EXCLUDED."technical_asset_id",
      "work_order_id" = EXCLUDED."work_order_id",
      "event_type" = EXCLUDED."event_type",
      "title" = EXCLUDED."title",
      "description" = EXCLUDED."description",
      "result" = EXCLUDED."result",
      "updated_at" = CURRENT_TIMESTAMP
  `);

  const actualCost = args.actualCost && args.actualCost > 0 ? args.actualCost : null;
  if (actualCost) {
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "ComponentCostEntry"
        ("id", "company_id", "property_id", "technical_asset_id", "work_order_id", "created_by_id",
         "cost_type", "description", "amount_ex_vat", "vat_rate", "cost_date", "sync_key", "created_at")
      VALUES
        (${randomUUID()}, ${args.companyId}, ${args.propertyId}, ${args.technicalAssetId}, ${args.workOrderId}, ${args.actorUserId},
         ${costType}, ${`Faktisk kostnad från arbetsorder ${reference}: ${args.title}`}, ${actualCost}, 25,
         ${args.completedAt}, ${costSyncKey}, CURRENT_TIMESTAMP)
      ON CONFLICT ("company_id", "sync_key") WHERE "sync_key" IS NOT NULL
      DO UPDATE SET
        "technical_asset_id" = EXCLUDED."technical_asset_id",
        "work_order_id" = EXCLUDED."work_order_id",
        "cost_type" = EXCLUDED."cost_type",
        "description" = EXCLUDED."description",
        "amount_ex_vat" = EXCLUDED."amount_ex_vat",
        "cost_date" = EXCLUDED."cost_date"
    `);
  } else {
    await tx.$executeRaw(Prisma.sql`
      DELETE FROM "ComponentCostEntry"
      WHERE "company_id" = ${args.companyId} AND "sync_key" = ${costSyncKey}
    `);
  }

  const cycle = await advancePreventiveMaintenanceCycle(tx, {
    companyId: args.companyId,
    technicalAssetId: args.technicalAssetId,
    workOrderId: args.workOrderId,
    completedAt: args.completedAt,
  });

  return {
    lifecycleSynced: true,
    costSynced: Boolean(actualCost),
    maintenanceCycleAdvanced: cycle.maintenanceCycleAdvanced,
    nextServiceAt: cycle.nextServiceAt,
  };
}
