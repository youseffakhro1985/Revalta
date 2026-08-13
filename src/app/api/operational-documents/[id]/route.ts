import { NextResponse } from "next/server";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { canManageTickets, getCurrentUser, type CompanyUser } from "@/lib/current-user";
import { isOperationalDocumentAccessible } from "@/lib/operational-document-access";
import { createLogger } from "@/lib/structured-logger";

const logger = createLogger({ route: "/api/operational-documents/[id]" });

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const { id } = await params;
    const document = await db.operationalDocument.findFirst({
      where: { id, company_id: user.company_id, deleted_at: null },
      select: {
        id: true,
        file_name: true,
        category: true,
        work_order_id: true,
        project_id: true,
        property_id: true,
        technical_asset_id: true,
      },
    });
    if (!document) return NextResponse.json({ error: "Dokumentet hittades inte" }, { status: 404 });
    if (!(await isOperationalDocumentAccessible(user as CompanyUser, document))) {
      return NextResponse.json({ error: "Dokumentet hittades inte" }, { status: 404 });
    }

    const deleteResult = await db.operationalDocument.updateMany({
      where: { id: document.id, company_id: user.company_id, deleted_at: null },
      data: { deleted_at: new Date() },
    });
    if (deleteResult.count === 0) {
      return NextResponse.json({ error: "Dokumentet hittades inte" }, { status: 404 });
    }

    const entityType = document.work_order_id
      ? "work_order"
      : document.project_id
        ? "project"
        : document.property_id
          ? "property"
          : "technical_asset";
    const entityId = document.work_order_id
      || document.project_id
      || document.property_id
      || document.technical_asset_id
      || document.id;

    await writeAuditLog(user, {
      entityType,
      entityId,
      action: "document.deleted",
      metadata: {
        documentId: document.id,
        fileName: document.file_name,
        category: document.category,
        softDelete: true,
        storage: "OperationalDocument",
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Delete operational document error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
