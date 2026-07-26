import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageTickets, getCurrentUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { validateUploadFile } from "@/lib/document-file-security";
import { StorageConfigurationError, storeAttachment } from "@/lib/storage";

const MAX_FILE_SIZE = 4 * 1024 * 1024;
const ENTITY_TYPES = new Set(["work_order", "project", "property", "technical_asset"]);

async function resolveEntity(companyId: string, entityType: string, entityId: string) {
  if (entityType === "work_order") return db.workOrder.findFirst({ where: { deleted_at: null, id: entityId, company_id: companyId }, select: { id: true } });
  if (entityType === "project") return db.project.findFirst({ where: { deleted_at: null, id: entityId, company_id: companyId }, select: { id: true } });
  if (entityType === "property") return db.property.findFirst({ where: { id: entityId, company_id: companyId }, select: { id: true } });
  if (entityType === "technical_asset") {
    const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "PropertyTechnicalAsset" WHERE "id" = ${entityId} AND "company_id" = ${companyId} LIMIT 1
    `);
    return rows[0] || null;
  }
  return null;
}

function toClientDocument(document: Record<string, unknown>, entityType: string, entityId: string) {
  const id = String(document.id);
  return {
    ...document,
    storage_url: entityType === "work_order"
      ? `/api/work-orders/${entityId}/documents/${id}`
      : `/api/operational-documents/${id}/download`,
  };
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const url = new URL(request.url);
  const entityType = url.searchParams.get("entityType") || "";
  const entityId = url.searchParams.get("entityId") || "";
  if (!entityId || !ENTITY_TYPES.has(entityType)) return NextResponse.json({ error: "Ogiltig dokumentkoppling" }, { status: 400 });

  const entity = await resolveEntity(user.company_id, entityType, entityId);
  if (!entity) return NextResponse.json({ error: "Objektet hittades inte" }, { status: 404 });

  if (entityType === "property" || entityType === "technical_asset") {
    const documents = await db.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT d."id", d."file_name", d."storage_key" AS "storage_url", d."content_type",
             d."size_bytes", d."category", d."visibility", d."version", d."created_at",
             json_build_object('id', u."id", 'name', u."name", 'email', u."email") AS "uploaded_by"
      FROM "OperationalDocument" d
      JOIN "User" u ON u."id" = d."uploaded_by_id"
      WHERE d."company_id" = ${user.company_id}
        AND d."deleted_at" IS NULL
        AND ${entityType === "property" ? Prisma.sql`d."property_id" = ${entityId}` : Prisma.sql`d."technical_asset_id" = ${entityId}`}
      ORDER BY d."created_at" DESC
      LIMIT 100
    `);
    return NextResponse.json({
      documents: documents.map((document) => toClientDocument(document, entityType, entityId)),
    });
  }

  const documents = await db.operationalDocument.findMany({
    where: {
      company_id: user.company_id,
      deleted_at: null,
      ...(entityType === "work_order" ? { work_order_id: entityId } : { project_id: entityId }),
    },
    orderBy: { created_at: "desc" },
    include: { uploaded_by: { select: { id: true, name: true, email: true } } },
    take: 100,
  });
  return NextResponse.json({
    documents: documents.map((document) => toClientDocument(document as unknown as Record<string, unknown>, entityType, entityId)),
  });
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const formData = await request.formData();
    const file = formData.get("file");
    const entityType = String(formData.get("entityType") || "");
    const entityId = String(formData.get("entityId") || "");
    const category = String(formData.get("category") || "other").trim().slice(0, 50);
    const visibility = String(formData.get("visibility") || "internal");

    if (!(file instanceof File)) return NextResponse.json({ error: "Välj en fil att ladda upp" }, { status: 400 });
    if (!entityId || !ENTITY_TYPES.has(entityType)) return NextResponse.json({ error: "Ogiltig dokumentkoppling" }, { status: 400 });
    if (!new Set(["internal", "shared"]).has(visibility)) return NextResponse.json({ error: "Ogiltig synlighet" }, { status: 400 });

    const bytes = Buffer.from(await file.arrayBuffer());
    const validation = validateUploadFile({
      bytes,
      contentType: file.type,
      fileName: file.name,
      profile: "operational_document",
      maxBytes: MAX_FILE_SIZE,
    });
    if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

    const entity = await resolveEntity(user.company_id, entityType, entityId);
    if (!entity) return NextResponse.json({ error: "Objektet hittades inte" }, { status: 404 });

    const stored = await storeAttachment({
      fileName: validation.fileName,
      contentType: validation.contentType,
      buffer: bytes,
      prefix: `companies/${user.company_id}/${entityType}/${entityId}`,
    });

    let document: Record<string, unknown>;
    if (entityType === "property" || entityType === "technical_asset") {
      const documentId = crypto.randomUUID();
      const rows = await db.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
        INSERT INTO "OperationalDocument"
          ("id", "company_id", "property_id", "technical_asset_id", "uploaded_by_id", "file_name", "storage_key",
           "content_type", "size_bytes", "category", "visibility", "version")
        VALUES
          (${documentId}, ${user.company_id}, ${entityType === "property" ? entityId : null}, ${entityType === "technical_asset" ? entityId : null},
           ${user.id}, ${validation.fileName.slice(0, 255)}, ${stored.url}, ${validation.contentType}, ${validation.sizeBytes}, ${category}, ${visibility}, 1)
        RETURNING "id", "file_name", "storage_key" AS "storage_url", "content_type", "size_bytes", "category", "visibility", "version", "created_at"
      `);
      document = { ...rows[0], uploaded_by: { id: user.id, name: user.name, email: user.email } };
    } else {
      document = await db.operationalDocument.create({
        data: {
          company_id: user.company_id,
          work_order_id: entityType === "work_order" ? entityId : null,
          project_id: entityType === "project" ? entityId : null,
          uploaded_by_id: user.id,
          file_name: validation.fileName.slice(0, 255),
          storage_url: stored.url,
          content_type: validation.contentType,
          size_bytes: validation.sizeBytes,
          category,
          visibility,
          version: 1,
        },
        include: { uploaded_by: { select: { id: true, name: true, email: true } } },
      }) as unknown as Record<string, unknown>;
    }

    await writeAuditLog(user, {
      entityType,
      entityId,
      action: "document.uploaded",
      metadata: {
        documentId: document.id,
        fileName: document.file_name,
        contentType: document.content_type,
        sizeBytes: document.size_bytes,
        category,
        visibility,
      },
    });

    return NextResponse.json({ document: toClientDocument(document, entityType, entityId) }, { status: 201 });
  } catch (error) {
    if (error instanceof StorageConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("Create operational document error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
