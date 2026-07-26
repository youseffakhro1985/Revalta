import { Prisma } from "@prisma/client";
import db, { getPrismaBaseClient } from "@/lib/db";
import { sqlSoftDeleteGuard } from "@/lib/soft-delete-compat";

type Client = Prisma.TransactionClient | typeof db;

export type WorkOrderAssetLink = {
  building_id: string | null;
  building_name: string | null;
  technical_asset_id: string | null;
  technical_asset_name: string | null;
  technical_asset_category: string | null;
  technical_asset_location: string | null;
};

export async function validateWorkOrderAssetLinks(client: Client, args: {
  companyId: string;
  propertyId: string;
  buildingId?: string | null;
  technicalAssetId?: string | null;
}) {
  if (args.buildingId) {
    const rows = await client.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT b."id"
      FROM "Building" b
      INNER JOIN "Property" p ON p."id" = b."property_id"
      WHERE b."id" = ${args.buildingId}
        AND b."property_id" = ${args.propertyId}
        AND p."company_id" = ${args.companyId}
      LIMIT 1
    `);
    if (!rows[0]) throw new Error("Byggnaden tillhör inte vald fastighet");
  }

  if (args.technicalAssetId) {
    const rows = await client.$queryRaw<Array<{ id: string; building_id: string | null }>>(Prisma.sql`
      SELECT "id", "building_id"
      FROM "PropertyTechnicalAsset"
      WHERE "id" = ${args.technicalAssetId}
        AND "property_id" = ${args.propertyId}
        AND "company_id" = ${args.companyId}
      LIMIT 1
    `);
    const asset = rows[0];
    if (!asset) throw new Error("Komponenten tillhör inte vald fastighet");
    if (args.buildingId && asset.building_id && asset.building_id !== args.buildingId) {
      throw new Error("Komponenten tillhör inte vald byggnad");
    }
  }
}

export async function setWorkOrderAssetLinks(tx: Prisma.TransactionClient, args: {
  workOrderId: string;
  companyId: string;
  buildingId?: string | null;
  technicalAssetId?: string | null;
}) {
  await tx.$executeRaw(Prisma.sql`
    UPDATE "WorkOrder"
    SET "building_id" = ${args.buildingId ?? null},
        "technical_asset_id" = ${args.technicalAssetId ?? null}
    WHERE "id" = ${args.workOrderId} AND "company_id" = ${args.companyId}
  `);
}

export async function getWorkOrderAssetLink(client: Client, companyId: string, workOrderId: string) {
  const workOrderGuard = await sqlSoftDeleteGuard(getPrismaBaseClient(), "WorkOrder", "w");
  const rows = await client.$queryRaw<WorkOrderAssetLink[]>(Prisma.sql`
    SELECT w."building_id", b."name" AS "building_name",
      w."technical_asset_id", a."name" AS "technical_asset_name",
      a."category" AS "technical_asset_category", a."location" AS "technical_asset_location"
    FROM "WorkOrder" w
    LEFT JOIN "Building" b ON b."id" = w."building_id"
    LEFT JOIN "PropertyTechnicalAsset" a ON a."id" = w."technical_asset_id"
    WHERE w."id" = ${workOrderId} AND w."company_id" = ${companyId}
      ${workOrderGuard}
    LIMIT 1
  `);
  return rows[0] ?? null;
}
