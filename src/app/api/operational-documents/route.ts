import { Prisma } from "@prisma/client";
import { del, put } from "@vercel/blob";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageTickets, getCurrentUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { FileSecurityError, inspectUpload } from "@/lib/document-file-security";
import { getStorageToken } from "@/lib/storage";

const MAX_FILE_SIZE = 4 * 1024 * 1024;
const ENTITY_TYPES = new Set(["work_order", "project", "property", "technical_asset"]);
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
]);

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 120);
}

async function resolveEntity(companyId: string, entityType: string, entityId: string) {
  if (entityType === "work_order") return db.workOrder.findFirst({ where: { id: entityId, company_id: companyId }, select: { id: true } });
  if (entityType === "project") return db.project.findFirst({ where: { id: entityId, company_id: companyId }, select: { id: true } });
  if (entityType === "property") return db.property.findFirst({ where: { id: entityId, company_id: companyId }, select: { id: true } });
  if (entityType === "technical_asset") {
    const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "PropertyTechnicalAsset" WHERE "id" = ${entityId} AND "company_id" = ${companyId} LIMIT 1
    `);
    return rows[0] || null;
  }
  return null;
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
        AND ${entityType === "property" ? Prisma.sql`d."property_id" = ${entityId}` : Prisma.sql`d."technical_asset_id" = ${entityId}`}
      ORDER BY d."created_at" DESC
      LIMIT 100
    `);
    return NextResponse.json({ documents: documents.map((document) => ({
      ...document,
      storage_url: `/api/operational-documents/${String(document.id)}`,
    })) });
  }

  const documents = await db.operationalDocument.findMany({
    where: {
      company_id: user.company_id,
      ...(entityType === "work_order" ? { work_order_id: entityId } : { project_id: entityId }),
    },
    orderBy: { created_at: "desc" },
    include: { uploaded_by: { select: { id: true, name: true, email: true } } },
    take: 100,
  });
  return NextResponse.json({ documents: documents.map((document) => ({
    ...document,
    storage_url: `/api/operational-documents/${document.id}`,
  })) });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  const token = getStorageToken();
  if (!token) return NextResponse.json({ error: "Fillagringen är inte konfigurerad" }, { status: 503 });

  const formData = await request.formData();
  const file = formData.get("file");
  const entityType = String(formData.get("entityType") || "");
  const entityId = String(formData.get("entityId") || "");
  const category = String(formData.get("category") || "other").trim().slice(0, 50);
  const visibility = String(formData.get("visibility") || "internal");

  if (!(file instanceof File)) return NextResponse.json({ error: "Välj en fil att ladda upp" }, { status: 400 });
  if (!entityId || !ENTITY_TYPES.has(entityType)) return NextResponse.json({ error: "Ogiltig dokumentkoppling" }, { status: 400 });
  if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: "Filtypen stöds inte" }, { status: 415 });
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "Filen får vara högst 4 MB" }, { status: 413 });
  if (!new Set(["internal", "shared"]).has(visibility)) return NextResponse.json({ error: "Ogiltig synlighet" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  let inspection;
  try {
    inspection = inspectUpload(buffer, file.type, ALLOWED_TYPES);
  } catch (error) {
    if (error instanceof FileSecurityError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }

  const entity = await resolveEntity(user.company_id, entityType, entityId);
  if (!entity) return NextResponse.json({ error: "Objektet hittades inte" }, { status: 404 });

  const fileName = safeFileName(file.name || "dokument");
  const pathname = `companies/${user.company_id}/${entityType}/${entityId}/${crypto.randomUUID()}-${fileName}`;
  const blob = await put(pathname, buffer, { access: "private", addRandomSuffix: false, contentType: file.type, token });

  let document: Record<string, unknown>;
  try {
    if (entityType === "property" || entityType === "technical_asset") {
      const documentId = crypto.randomUUID();
      const rows = await db.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
        INSERT INTO "OperationalDocument"
          ("id", "company_id", "property_id", "technical_asset_id", "uploaded_by_id", "file_name", "storage_key",
           "content_type", "size_bytes", "category", "visibility", "version")
        VALUES
          (${documentId}, ${user.company_id}, ${entityType === "property" ? entityId : null}, ${entityType === "technical_asset" ? entityId : null},
           ${user.id}, ${file.name.slice(0, 255)}, ${blob.url}, ${file.type}, ${file.size}, ${category}, ${visibility}, 1)
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
          file_name: file.name.slice(0, 255),
          storage_url: blob.url,
          content_type: file.type,
          size_bytes: file.size,
          category,
          visibility,
          version: 1,
        },
        include: { uploaded_by: { select: { id: true, name: true, email: true } } },
      });
    }
  } catch (error) {
    await del(blob.url, { token }).catch(() => undefined);
    throw error;
  }

  const publicDocument = { ...document, storage_url: `/api/operational-documents/${String(document.id)}` };

  await writeAuditLog(user, {
    entityType,
    entityId,
    action: "document.uploaded",
    metadata: { documentId: document.id, fileName: document.file_name, contentType: document.content_type, sizeBytes: document.size_bytes, category, visibility, detectedContentType: inspection.detectedContentType, checksumSha256: inspection.checksumSha256, scanStatus: inspection.scanStatus },
  });

  return NextResponse.json({ document: publicDocument }, { status: 201 });
}
