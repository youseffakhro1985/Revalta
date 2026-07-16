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

export function componentEventTypeForWorkOrder(workType: string) {
  return EVENT_TYPE_BY_WORK_TYPE[workType] || "repair";
}

export function componentCostTypeForWorkOrder(workType: string) {
  return COST_TYPE_BY_WORK_TYPE[workType] || "other";
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
    return { lifecycleSynced: false, costSynced: false };
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

  return { lifecycleSynced: true, costSynced: Boolean(actualCost) };
}
