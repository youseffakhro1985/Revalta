import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageTickets, getCurrentUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";

const MAX_FILE_SIZE = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 120);
}

async function resolveEntity(companyId: string, entityType: string, entityId: string) {
  if (entityType === "work_order") {
    return db.workOrder.findFirst({ where: { id: entityId, company_id: companyId }, select: { id: true } });
  }
  if (entityType === "project") {
    return db.project.findFirst({ where: { id: entityId, company_id: companyId }, select: { id: true } });
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
  if (!entityId || !["work_order", "project"].includes(entityType)) {
    return NextResponse.json({ error: "Ogiltig dokumentkoppling" }, { status: 400 });
  }

  const entity = await resolveEntity(user.company_id, entityType, entityId);
  if (!entity) return NextResponse.json({ error: "Objektet hittades inte" }, { status: 404 });

  const documents = await db.operationalDocument.findMany({
    where: {
      company_id: user.company_id,
      ...(entityType === "work_order" ? { work_order_id: entityId } : { project_id: entityId }),
    },
    orderBy: { created_at: "desc" },
    include: { uploaded_by: { select: { id: true, name: true, email: true } } },
    take: 100,
  });

  return NextResponse.json({ documents });
}

export async function POST(request: Request) {
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
  if (!entityId || !["work_order", "project"].includes(entityType)) {
    return NextResponse.json({ error: "Ogiltig dokumentkoppling" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: "Filtypen stöds inte" }, { status: 415 });
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "Filen får vara högst 4 MB" }, { status: 413 });
  }
  if (!new Set(["internal", "shared"]).has(visibility)) {
    return NextResponse.json({ error: "Ogiltig synlighet" }, { status: 400 });
  }

  const entity = await resolveEntity(user.company_id, entityType, entityId);
  if (!entity) return NextResponse.json({ error: "Objektet hittades inte" }, { status: 404 });

  const fileName = safeFileName(file.name || "dokument");
  const pathname = `companies/${user.company_id}/${entityType}/${entityId}/${crypto.randomUUID()}-${fileName}`;
  const blob = await put(pathname, file, { access: "public", addRandomSuffix: false, contentType: file.type });

  const document = await db.operationalDocument.create({
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

  await writeAuditLog(user, {
    entityType,
    entityId,
    action: "document.uploaded",
    metadata: { documentId: document.id, fileName: document.file_name, contentType: document.content_type, sizeBytes: document.size_bytes, category, visibility },
  });

  return NextResponse.json({ document }, { status: 201 });
}
