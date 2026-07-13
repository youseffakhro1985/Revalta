import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser, tenantWhere } from "@/lib/current-user";

const allowedTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });

    const [logs, properties] = await Promise.all([
      db.auditLog.findMany({
        where: {
          ...tenantWhere(user),
          entity_type: "document",
          action: "document.created",
        },
        orderBy: { created_at: "desc" },
        take: 250,
        select: { id: true, metadata: true, created_at: true, actor: { select: { name: true, email: true } } },
      }),
      db.property.findMany({
        where: tenantWhere(user),
        orderBy: { name: "asc" },
        select: { id: true, name: true, address: true, city: true },
      }),
    ]);

    const propertyMap = new Map(properties.map((property) => [property.id, property]));
    const documents = logs.map((log) => {
      const metadata = (log.metadata || {}) as Record<string, unknown>;
      const propertyId = typeof metadata.propertyId === "string" ? metadata.propertyId : null;
      return {
        id: log.id,
        name: typeof metadata.name === "string" ? metadata.name : "Dokument",
        category: typeof metadata.category === "string" ? metadata.category : "other",
        validUntil: typeof metadata.validUntil === "string" ? metadata.validUntil : null,
        fileName: typeof metadata.fileName === "string" ? metadata.fileName : null,
        contentType: typeof metadata.contentType === "string" ? metadata.contentType : null,
        sizeBytes: typeof metadata.sizeBytes === "number" ? metadata.sizeBytes : 0,
        dataUrl: typeof metadata.dataUrl === "string" ? metadata.dataUrl : null,
        property: propertyId ? propertyMap.get(propertyId) || null : null,
        uploadedBy: log.actor?.name || log.actor?.email || "Okänd",
        createdAt: log.created_at,
      };
    });

    return NextResponse.json({ documents, properties });
  } catch (error) {
    console.error("Get documents error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!["owner", "admin", "manager"].includes(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att ladda upp dokument" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const name = String(formData.get("name") || "").trim();
    const category = String(formData.get("category") || "other").trim();
    const propertyId = String(formData.get("propertyId") || "").trim();
    const validUntil = String(formData.get("validUntil") || "").trim();

    if (!(file instanceof File) || !name) {
      return NextResponse.json({ error: "Dokumentnamn och fil krävs" }, { status: 400 });
    }
    if (!allowedTypes.has(file.type)) {
      return NextResponse.json({ error: "Filtypen stöds inte" }, { status: 400 });
    }
    if (file.size > 2_000_000) {
      return NextResponse.json({ error: "Filen får vara högst 2 MB i denna version" }, { status: 400 });
    }

    if (propertyId) {
      const property = await db.property.findFirst({ where: { id: propertyId, ...tenantWhere(user) }, select: { id: true } });
      if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const dataUrl = `data:${file.type};base64,${bytes.toString("base64")}`;
    const document = await db.auditLog.create({
      data: {
        company_id: user.company_id,
        actor_user_id: user.id,
        entity_type: "document",
        entity_id: propertyId || null,
        action: "document.created",
        metadata: {
          name,
          category,
          propertyId: propertyId || null,
          validUntil: validUntil || null,
          fileName: file.name,
          contentType: file.type,
          sizeBytes: file.size,
          dataUrl,
        },
      },
      select: { id: true, created_at: true },
    });

    return NextResponse.json({ success: true, document }, { status: 201 });
  } catch (error) {
    console.error("Create document error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
