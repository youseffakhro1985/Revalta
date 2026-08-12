import { Prisma } from "@prisma/client";
import db from "@/lib/db";
import { sqlSoftDeleteGuard } from "@/lib/soft-delete-compat";
import { findAccessibleWorkOrder } from "@/lib/assigned-work-access";
import type { CompanyUser } from "@/lib/current-user";
import { canViewOperations } from "@/lib/permissions";

type OperationalDocumentParentRefs = {
  work_order_id: string | null;
  project_id: string | null;
  property_id: string | null;
  technical_asset_id: string | null;
};

/** Returns true when the document's parent entity belongs to an active (non-soft-deleted) property. */
export async function isOperationalDocumentParentActive(
  companyId: string,
  document: OperationalDocumentParentRefs,
): Promise<boolean> {
  if (document.work_order_id) {
    const workOrder = await db.workOrder.findFirst({
      where: {
        deleted_at: null,
        id: document.work_order_id,
        company_id: companyId,
        property: { deleted_at: null },
      },
      select: { id: true },
    });
    return Boolean(workOrder);
  }

  if (document.project_id) {
    const project = await db.project.findFirst({
      where: {
        deleted_at: null,
        id: document.project_id,
        company_id: companyId,
        property: { deleted_at: null },
      },
      select: { id: true },
    });
    return Boolean(project);
  }

  if (document.property_id) {
    const property = await db.property.findFirst({
      where: { id: document.property_id, company_id: companyId, deleted_at: null },
      select: { id: true },
    });
    return Boolean(property);
  }

  if (document.technical_asset_id) {
    const propertyGuard = await sqlSoftDeleteGuard(db, "Property", "p");
    const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT a."id"
      FROM "PropertyTechnicalAsset" a
      INNER JOIN "Property" p ON p."id" = a."property_id" AND p."company_id" = a."company_id"
      WHERE a."id" = ${document.technical_asset_id}
        AND a."company_id" = ${companyId}
        ${propertyGuard}
      LIMIT 1
    `);
    return Boolean(rows[0]);
  }

  return false;
}

/** Enforces technician assignment scope in addition to tenant and parent activity. */
export async function isOperationalDocumentAccessible(
  user: CompanyUser,
  document: OperationalDocumentParentRefs,
) {
  if (document.work_order_id) {
    return Boolean(await findAccessibleWorkOrder(user, document.work_order_id));
  }
  if (document.project_id && !canViewOperations(user.role)) return false;
  return isOperationalDocumentParentActive(user.company_id, document);
}
