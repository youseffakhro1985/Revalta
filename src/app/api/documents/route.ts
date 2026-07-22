import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser, tenantWhere } from "@/lib/current-user";
import { getDocumentLifecycleMap } from "@/lib/document-lifecycle";
import { validateDocumentFile } from "@/lib/document-file-security";

const allowedVisibilities = new Set([
  "internal",
  "resident_all",
  "resident_property",
  "resident_unit",
  "resident_lease",
]);

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });

    const [logs, properties, leases] = await Promise.all([
      db.auditLog.findMany({
        where: { ...tenantWhere(user), entity_type: "document", action: "document.created" },
        orderBy: { created_at: "desc" },
        take: 500,
        select: { id: true, metadata: true, created_at: true, actor: { select: { name: true, email: true } } },
      }),
      db.property.findMany({
        where: tenantWhere(user),
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          address: true,
          city: true,
          units: { orderBy: { designation: "asc" }, select: { id: true, designation: true } },
        },
      }),
      user.company_id
        ? db.lease.findMany({
            where: { company_id: user.company_id },
            orderBy: { lease_number: "asc" },
            take: 2000,
            select: {
              id: true,
              lease_number: true,
              status: true,
              property_id: true,
              unit_id: true,
              lease_holder: { select: { name: true, contact_name: true } },
              unit: { select: { designation: true } },
            },
          })
        : Promise.resolve([]),
    ]);

    const lifecycleMap = user.company_id
      ? await getDocumentLifecycleMap(user.company_id, logs.map((log) => log.id))
      : new Map();
    const propertyMap = new Map(properties.map((property) => [property.id, property]));
    const leaseMap = new Map(leases.map((lease) => [lease.id, lease]));
    const documents = logs.map((log) => {
      const metadata = (log.metadata || {}) as Record<string, unknown>;
      const propertyId = typeof metadata.propertyId === "string" ? metadata.propertyId : null;
      const unitId = typeof metadata.unitId === "string" ? metadata.unitId : null;
      const leaseId = typeof metadata.leaseId === "string" ? metadata.leaseId : null;
      const visibility = typeof metadata.visibility === "string" && allowedVisibilities.has(metadata.visibility)
        ? metadata.visibility
        : "internal";
      const property = propertyId ? propertyMap.get(propertyId) || null : null;
      const unit = unitId ? property?.units.find((candidate) => candidate.id === unitId) || null : null;
      const lease = leaseId ? leaseMap.get(leaseId) || null : null;
      const lifecycle = lifecycleMap.get(log.id) || { state: "active", changedAt: null };

      return {
        id: log.id,
        name: typeof metadata.name === "string" ? metadata.name : "Dokument",
        category: typeof metadata.category === "string" ? metadata.category : "other",
        visibility,
        lifecycleState: lifecycle.state,
        lifecycleChangedAt: lifecycle.changedAt,
        validUntil: typeof metadata.validUntil === "string" ? metadata.validUntil : null,
        fileName: typeof metadata.fileName === "string" ? metadata.fileName : null,
        contentType: typeof metadata.contentType === "string" ? metadata.contentType : null,
        sizeBytes: typeof metadata.sizeBytes === "number" ? metadata.sizeBytes : 0,
        dataUrl: typeof metadata.dataUrl === "string" ? metadata.dataUrl : null,
        property,
        unit,
        lease: lease ? {
          id: lease.id,
          leaseNumber: lease.lease_number,
          status: lease.status,
          holder: lease.lease_holder.contact_name || lease.lease_holder.name,
          unit: lease.unit.designation,
        } : null,
        uploadedBy: log.actor?.name || log.actor?.email || "Okänd",
        createdAt: log.created_at,
      };
    });

    return NextResponse.json(
      { documents, properties, leases, canManageLifecycle: Boolean(user.company_id && ["owner", "admin", "manager"].includes(user.role)) },
      { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } },
    );
  } catch (error) {
    console.error("Get documents error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
    if (!["owner", "admin", "manager"].includes(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att ladda upp dokument" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const name = String(formData.get("name") || "").trim();
    const category = String(formData.get("category") || "other").trim();
    const visibility = String(formData.get("visibility") || "internal").trim();
    const propertyId = String(formData.get("propertyId") || "").trim();
    const unitId = String(formData.get("unitId") || "").trim();
    const leaseId = String(formData.get("leaseId") || "").trim();
    const validUntil = String(formData.get("validUntil") || "").trim();

    if (!(file instanceof File) || !name) return NextResponse.json({ error: "Dokumentnamn och fil krävs" }, { status: 400 });
    if (name.length > 200 || category.length > 80) return NextResponse.json({ error: "Dokumentnamnet eller kategorin är för lång" }, { status: 400 });
    if (!allowedVisibilities.has(visibility)) return NextResponse.json({ error: "Ogiltig dokumentsynlighet" }, { status: 400 });

    const bytes = Buffer.from(await file.arrayBuffer());
    const validation = validateDocumentFile({ bytes, contentType: file.type, fileName: file.name, maxBytes: 2_000_000 });
    if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

    let resolvedPropertyId = propertyId || null;
    let resolvedUnitId = unitId || null;
    let resolvedLeaseId = leaseId || null;

    if (visibility === "resident_property" && !propertyId) return NextResponse.json({ error: "Fastighet krävs för denna synlighet" }, { status: 400 });
    if (visibility === "resident_unit" && !unitId) return NextResponse.json({ error: "Objekt krävs för denna synlighet" }, { status: 400 });
    if (visibility === "resident_lease" && !leaseId) return NextResponse.json({ error: "Hyresavtal krävs för denna synlighet" }, { status: 400 });

    if (leaseId) {
      const lease = await db.lease.findFirst({ where: { id: leaseId, company_id: user.company_id }, select: { id: true, property_id: true, unit_id: true } });
      if (!lease) return NextResponse.json({ error: "Hyresavtalet hittades inte" }, { status: 404 });
      resolvedLeaseId = lease.id;
      resolvedPropertyId = lease.property_id;
      resolvedUnitId = lease.unit_id;
    } else if (unitId) {
      const unit = await db.unit.findFirst({ where: { id: unitId, property: { company_id: user.company_id } }, select: { id: true, property_id: true } });
      if (!unit) return NextResponse.json({ error: "Objektet hittades inte" }, { status: 404 });
      if (propertyId && propertyId !== unit.property_id) return NextResponse.json({ error: "Objektet tillhör inte den valda fastigheten" }, { status: 400 });
      resolvedUnitId = unit.id;
      resolvedPropertyId = unit.property_id;
    } else if (propertyId) {
      const property = await db.property.findFirst({ where: { id: propertyId, company_id: user.company_id }, select: { id: true } });
      if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });
      resolvedPropertyId = property.id;
    }

    if (visibility === "resident_all" || visibility === "internal") {
      resolvedPropertyId = null;
      resolvedUnitId = null;
      resolvedLeaseId = null;
    }

    const dataUrl = `data:${validation.contentType};base64,${bytes.toString("base64")}`;
    const document = await db.auditLog.create({
      data: {
        company_id: user.company_id,
        actor_user_id: user.id,
        entity_type: "document",
        entity_id: resolvedLeaseId || resolvedUnitId || resolvedPropertyId,
        action: "document.created",
        metadata: {
          schemaVersion: 3,
          name,
          category,
          visibility,
          propertyId: resolvedPropertyId,
          unitId: resolvedUnitId,
          leaseId: resolvedLeaseId,
          validUntil: validUntil || null,
          fileName: validation.fileName,
          contentType: validation.contentType,
          sizeBytes: validation.sizeBytes,
          dataUrl,
          signatureValidated: true,
        },
      },
      select: { id: true, created_at: true },
    });

    return NextResponse.json({ success: true, document }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Create document error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
