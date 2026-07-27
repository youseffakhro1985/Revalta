import { NextResponse } from "next/server";
import db from "@/lib/db";
import { auditScopedWhere, canViewLeasingData, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { getDocumentLifecycleMap } from "@/lib/document-lifecycle";
import { validateDocumentFile } from "@/lib/document-file-security";
import { parseOptionalDate } from "@/lib/dual-list";
import { isProductionRuntime } from "@/lib/runtime-env";
import { hasStorageConfig, storeAttachment, StorageConfigurationError } from "@/lib/storage";
import { writeAuditLog } from "@/lib/audit";

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

    const includeLeases = canViewLeasingData(user.role);
    const [rows, logs, properties, leases] = await Promise.all([
      user.company_id
        ? db.managedDocument.findMany({
            where: {
              company_id: user.company_id,
              OR: [{ property_id: null }, { property: { deleted_at: null } }],
            },
            orderBy: { created_at: "desc" },
            take: 500,
            include: { created_by: { select: { name: true, email: true } } },
          })
        : Promise.resolve([]),
      db.auditLog.findMany({
        where: { ...auditScopedWhere(user), entity_type: "document", action: "document.created" },
        orderBy: { created_at: "desc" },
        take: 500,
        select: { id: true, entity_id: true, metadata: true, created_at: true, actor: { select: { name: true, email: true } } },
      }),
      db.property.findMany({
        where: { deleted_at: null, ...tenantWhere(user) },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          address: true,
          city: true,
          units: { orderBy: { designation: "asc" }, select: { id: true, designation: true } },
        },
      }),
      includeLeases && user.company_id
        ? db.lease.findMany({
            where: { company_id: user.company_id, deleted_at: null, property: { deleted_at: null } },
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

    const modernIds = new Set(rows.map((row) => row.id));
    const lifecycleMap = user.company_id
      ? await getDocumentLifecycleMap(user.company_id, logs.map((log) => log.id).filter((id) => !modernIds.has(id)))
      : new Map();
    const propertyMap = new Map(properties.map((property) => [property.id, property]));
    const leaseMap = new Map(leases.map((lease) => [lease.id, lease]));

    const modern = rows.map((row) => {
      const property = row.property_id ? propertyMap.get(row.property_id) || null : null;
      const unit = row.unit_id ? property?.units.find((candidate) => candidate.id === row.unit_id) || null : null;
      const lease = row.lease_id ? leaseMap.get(row.lease_id) || null : null;
      return {
        id: row.id,
        name: row.name,
        category: row.category,
        visibility: row.visibility,
        lifecycleState: row.lifecycle_state,
        lifecycleChangedAt: row.updated_at,
        validUntil: row.valid_until?.toISOString().slice(0, 10) || null,
        fileName: row.file_name,
        contentType: row.content_type,
        sizeBytes: row.size_bytes,
        downloadUrl: `/api/documents/${row.id}/download`,
        property,
        unit,
        lease: lease ? {
          id: lease.id,
          leaseNumber: lease.lease_number,
          status: lease.status,
          holder: lease.lease_holder.contact_name || lease.lease_holder.name,
          unit: lease.unit.designation,
        } : null,
        uploadedBy: row.created_by?.name || row.created_by?.email || "Okänd",
        createdAt: row.created_at,
        source: "table" as const,
      };
    });

    const legacy = logs
      .filter((log) => {
        const metadata = (log.metadata || {}) as Record<string, unknown>;
        if (metadata.storage === "ManagedDocument") return false;
        if (modernIds.has(log.id)) return false;
        if (log.entity_id && modernIds.has(log.entity_id)) return false;
        return true;
      })
      .map((log) => {
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
          downloadUrl: `/api/documents/${log.id}/download`,
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
          source: "legacy" as const,
        };
      });

    const documents = [...modern, ...legacy]
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .slice(0, 500);

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
      const lease = await db.lease.findFirst({ where: { id: leaseId, company_id: user.company_id, deleted_at: null, property: { deleted_at: null } }, select: { id: true, property_id: true, unit_id: true } });
      if (!lease) return NextResponse.json({ error: "Hyresavtalet hittades inte" }, { status: 404 });
      resolvedLeaseId = lease.id;
      resolvedPropertyId = lease.property_id;
      resolvedUnitId = lease.unit_id;
    } else if (unitId) {
      const unit = await db.unit.findFirst({ where: { id: unitId, property: { company_id: user.company_id, deleted_at: null } }, select: { id: true, property_id: true } });
      if (!unit) return NextResponse.json({ error: "Objektet hittades inte" }, { status: 404 });
      if (propertyId && propertyId !== unit.property_id) return NextResponse.json({ error: "Objektet tillhör inte den valda fastigheten" }, { status: 400 });
      resolvedUnitId = unit.id;
      resolvedPropertyId = unit.property_id;
    } else if (propertyId) {
      const property = await db.property.findFirst({ where: { id: propertyId, company_id: user.company_id, deleted_at: null }, select: { id: true } });
      if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });
      resolvedPropertyId = property.id;
    }

    if (visibility === "resident_all" || visibility === "internal") {
      resolvedPropertyId = null;
      resolvedUnitId = null;
      resolvedLeaseId = null;
    }

    let storageUrl: string | null = null;
    let dataUrl: string | null = null;

    if (hasStorageConfig()) {
      const stored = await storeAttachment({
        fileName: validation.fileName,
        contentType: validation.contentType,
        buffer: bytes,
        prefix: `documents/${user.company_id}`,
      });
      storageUrl = stored.url;
    } else if (isProductionRuntime()) {
      return NextResponse.json({ error: "Fillagringen är inte konfigurerad" }, { status: 503 });
    } else {
      dataUrl = `data:${validation.contentType};base64,${bytes.toString("base64")}`;
    }

    const document = await db.managedDocument.create({
      data: {
        company_id: user.company_id,
        property_id: resolvedPropertyId,
        unit_id: resolvedUnitId,
        lease_id: resolvedLeaseId,
        name,
        category,
        visibility,
        valid_until: parseOptionalDate(validUntil),
        file_name: validation.fileName,
        content_type: validation.contentType,
        size_bytes: validation.sizeBytes,
        storage_url: storageUrl,
        data_url: dataUrl,
        lifecycle_state: "active",
        created_by_id: user.id,
      },
      select: { id: true, created_at: true },
    });

    await writeAuditLog(user, {
      entityType: "document",
      entityId: document.id,
      action: "document.created",
      metadata: {
        schemaVersion: 5,
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
        storage: "ManagedDocument",
      },
    });

    return NextResponse.json({ success: true, document }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof StorageConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("Create document error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const documentId = String(body.documentId || body.id || "").trim();
    if (!documentId) return NextResponse.json({ error: "Dokument-id krävs" }, { status: 400 });

    const existing = await db.managedDocument.findFirst({
      where: {
        id: documentId,
        company_id: user.company_id,
        OR: [{ property_id: null }, { property: { deleted_at: null } }],
      },
      select: {
        id: true,
        name: true,
        category: true,
        visibility: true,
        valid_until: true,
        lifecycle_state: true,
      },
    });
    if (!existing) {
      const legacy = await db.auditLog.findFirst({
        where: {
          ...auditScopedWhere(user),
          entity_type: "document",
          action: "document.created",
          id: documentId,
        },
        select: { id: true, metadata: true },
      });
      const metadata = (legacy?.metadata || {}) as Record<string, unknown>;
      if (legacy && metadata.storage !== "ManagedDocument") {
        return NextResponse.json({
          error: "Dokumentet finns kvar i äldre lagring. Kör backfill till ManagedDocument innan det kan ändras.",
        }, { status: 409 });
      }
      return NextResponse.json({ error: "Dokumentet hittades inte" }, { status: 404 });
    }

    if (existing.lifecycle_state === "archived") {
      return NextResponse.json({ error: "Arkiverade dokument kan inte redigeras. Återställ först." }, { status: 409 });
    }

    const data: {
      name?: string;
      category?: string;
      visibility?: string;
      valid_until?: Date | null;
    } = {};

    if (body.name !== undefined) {
      const name = String(body.name || "").trim();
      if (!name || name.length > 200) {
        return NextResponse.json({ error: "Dokumentnamn krävs och får vara max 200 tecken" }, { status: 400 });
      }
      data.name = name;
    }
    if (body.category !== undefined) {
      const category = String(body.category || "").trim() || "other";
      if (category.length > 80) {
        return NextResponse.json({ error: "Kategorin är för lång" }, { status: 400 });
      }
      data.category = category;
    }
    if (body.visibility !== undefined) {
      const visibility = String(body.visibility || "").trim();
      if (!allowedVisibilities.has(visibility)) {
        return NextResponse.json({ error: "Ogiltig synlighet" }, { status: 400 });
      }
      // Keep existing property/unit/lease targeting; only allow visibility flips that do not
      // require new parent resolution in this field PATCH.
      if (
        (visibility === "resident_property" || visibility === "resident_unit" || visibility === "resident_lease") &&
        existing.visibility === "internal"
      ) {
        return NextResponse.json({
          error: "Byt synlighet till boende via ny uppladdning eller behåll befintlig målgrupp.",
        }, { status: 400 });
      }
      data.visibility = visibility;
    }
    if (body.validUntil !== undefined) {
      const raw = String(body.validUntil || "").trim();
      data.valid_until = raw ? parseOptionalDate(raw) : null;
      if (raw && !data.valid_until) {
        return NextResponse.json({ error: "Ogiltigt giltighetsdatum" }, { status: 400 });
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Inga fält att uppdatera" }, { status: 400 });
    }

    const updated = await db.managedDocument.updateMany({
      where: { id: existing.id, company_id: user.company_id },
      data,
    });
    if (updated.count === 0) {
      return NextResponse.json({ error: "Dokumentet hittades inte" }, { status: 404 });
    }

    await writeAuditLog(user, {
      entityType: "document",
      entityId: existing.id,
      action: "document.updated",
      metadata: {
        previousName: existing.name,
        name: data.name ?? existing.name,
        category: data.category ?? existing.category,
        visibility: data.visibility ?? existing.visibility,
        storage: "ManagedDocument",
      },
    });

    return NextResponse.json({ success: true, id: existing.id });
  } catch (error) {
    console.error("Update document error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
