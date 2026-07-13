import db from "@/lib/db";
import { canManageTickets, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { NextResponse } from "next/server";

const action = "signature.created";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    const [logs, properties] = await Promise.all([
      db.auditLog.findMany({ where: { company_id: user.company_id ?? undefined, action }, orderBy: { created_at: "desc" }, take: 500, select: { id: true, entity_id: true, metadata: true, created_at: true } }),
      db.property.findMany({ where: tenantWhere(user), orderBy: { name: "asc" }, select: { id: true, name: true } }),
    ]);
    return NextResponse.json({ signatures: logs.map((log) => ({ id: log.id, property_id: log.entity_id, ...(log.metadata as object), created_at: log.created_at })), properties });
  } catch (error) {
    console.error("Get signatures error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
    const body = await request.json();
    const propertyId = String(body.propertyId || "").trim();
    const documentType = String(body.documentType || "receipt").trim();
    const title = String(body.title || "").trim();
    const signerName = String(body.signerName || "").trim();
    const signerEmail = String(body.signerEmail || "").trim();
    const reference = String(body.reference || "").trim();
    const signedAt = String(body.signedAt || "").trim();
    const method = String(body.method || "manual").trim();
    const note = String(body.note || "").trim();
    const allowedTypes = new Set(["receipt", "work_order", "inspection", "quote", "handover", "other"]);
    const allowedMethods = new Set(["manual", "email", "bankid", "in_person"]);
    if (!propertyId || !title || !signerName || !signedAt || !allowedTypes.has(documentType) || !allowedMethods.has(method)) return NextResponse.json({ error: "Fyll i obligatoriska uppgifter" }, { status: 400 });
    const property = await db.property.findFirst({ where: { id: propertyId, ...tenantWhere(user) }, select: { id: true, name: true } });
    if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });
    await writeAuditLog(user, { entityType: "property", entityId: property.id, action, metadata: { property_name: property.name, document_type: documentType, title, signer_name: signerName, signer_email: signerEmail, reference, signed_at: signedAt, method, note, verification_status: "verified" } });
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error("Create signature error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}