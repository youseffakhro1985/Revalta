import { del, put } from "@vercel/blob";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageTickets, getCurrentUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { getStorageToken } from "@/lib/storage";
import { FileSecurityError, inspectUpload } from "@/lib/document-file-security";

export const dynamic = "force-dynamic";
const categories = new Set(["before", "after", "invoice", "warranty", "manual", "report", "other"]);
const visibilities = new Set(["internal", "shared"]);
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MAX_SIZE = 15 * 1024 * 1024;

async function context(id: string) {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Obehörig" }, { status: 401 }) } as const;
  if (!user.company_id) return { error: NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 }) } as const;
  const workOrder = await db.workOrder.findFirst({ where: { id, company_id: user.company_id }, select: { id: true, title: true } });
  if (!workOrder) return { error: NextResponse.json({ error: "Arbetsordern hittades inte" }, { status: 404 }) } as const;
  return { user, workOrder } as const;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await context(id);
  if ("error" in ctx) return ctx.error;
  const storedDocuments = await db.operationalDocument.findMany({
    where: { company_id: ctx.user.company_id!, work_order_id: id },
    orderBy: { created_at: "desc" },
    select: { id: true, file_name: true, storage_url: true, content_type: true, size_bytes: true, category: true, visibility: true, version: true, created_at: true, uploaded_by: { select: { id: true, name: true, email: true } } },
  });
  const documents = storedDocuments.map((document) => ({
    ...document,
    storage_url: `/api/work-orders/${id}/documents/${document.id}`,
  }));
  return NextResponse.json({ documents, canManage: canManageTickets(ctx.user.role) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await context(id);
  if ("error" in ctx) return ctx.error;
  if (!canManageTickets(ctx.user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
  const token = getStorageToken();
  if (!token) return NextResponse.json({ error: "Fillagringen är inte konfigurerad" }, { status: 503 });

  const form = await request.formData();
  const file = form.get("file");
  const category = String(form.get("category") || "other");
  const visibility = String(form.get("visibility") || "internal");
  if (!(file instanceof File)) return NextResponse.json({ error: "Välj en fil" }, { status: 400 });
  if (!allowedTypes.has(file.type)) return NextResponse.json({ error: "Endast JPG, PNG, WebP och PDF tillåts" }, { status: 400 });
  if (file.size <= 0 || file.size > MAX_SIZE) return NextResponse.json({ error: "Filen måste vara högst 15 MB" }, { status: 400 });
  if (!categories.has(category) || !visibilities.has(visibility)) return NextResponse.json({ error: "Ogiltig dokumentkategori eller synlighet" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  let inspection;
  try {
    inspection = inspectUpload(buffer, file.type, allowedTypes);
  } catch (error) {
    if (error instanceof FileSecurityError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120);
  const blob = await put(`work-orders/${ctx.user.company_id}/${id}/${crypto.randomUUID()}-${safeName}`, buffer, {
    access: "private",
    addRandomSuffix: false,
    contentType: file.type,
    token,
  });
  try {
    const document = await db.operationalDocument.create({
      data: { company_id: ctx.user.company_id!, work_order_id: id, uploaded_by_id: ctx.user.id, file_name: file.name.slice(0, 255), storage_url: blob.url, content_type: file.type, size_bytes: file.size, category, visibility },
      select: { id: true, file_name: true, storage_url: true, content_type: true, size_bytes: true, category: true, visibility: true, version: true, created_at: true, uploaded_by: { select: { id: true, name: true, email: true } } },
    });
    await writeAuditLog(ctx.user, { entityType: "work_order", entityId: id, action: "work_order.document_uploaded", metadata: { documentId: document.id, fileName: document.file_name, category, visibility, sizeBytes: document.size_bytes, detectedContentType: inspection.detectedContentType, checksumSha256: inspection.checksumSha256, scanStatus: inspection.scanStatus } });
    return NextResponse.json({
      document: { ...document, storage_url: `/api/work-orders/${id}/documents/${document.id}` },
    }, { status: 201 });
  } catch (error) {
    await del(blob.url, { token }).catch(() => undefined);
    throw error;
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await context(id);
  if ("error" in ctx) return ctx.error;
  if (!canManageTickets(ctx.user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
  const documentId = new URL(request.url).searchParams.get("documentId");
  if (!documentId) return NextResponse.json({ error: "Dokument-ID saknas" }, { status: 400 });
  const document = await db.operationalDocument.findFirst({ where: { id: documentId, company_id: ctx.user.company_id!, work_order_id: id } });
  if (!document) return NextResponse.json({ error: "Dokumentet hittades inte" }, { status: 404 });
  const token = getStorageToken();
  if (!token) return NextResponse.json({ error: "Fillagringen är inte konfigurerad" }, { status: 503 });
  await del(document.storage_url, { token });
  await db.operationalDocument.delete({ where: { id: document.id } });
  await writeAuditLog(ctx.user, { entityType: "work_order", entityId: id, action: "work_order.document_deleted", metadata: { documentId: document.id, fileName: document.file_name, category: document.category } });
  return NextResponse.json({ success: true });
}
