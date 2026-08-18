import { NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import db from "@/lib/db";
import { auditScopedWhere, canViewLeasingData, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { getDocumentLifecycleMap } from "@/lib/document-lifecycle";
import { validateDocumentFile } from "@/lib/document-file-security";
import { parseOptionalDate, loadLegacyRows } from "@/lib/dual-list";
import { isProductionRuntime } from "@/lib/runtime-env";
import { hasStorageConfig, storeAttachment, StorageConfigurationError } from "@/lib/storage";
import { writeAuditLog } from "@/lib/audit";
import { createRouteObservability } from "@/lib/route-observability";

const ROUTE = "/api/documents";
const SUCCESS_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

const allowedVisibilities = new Set([
  "internal",
  "resident_all",
  "resident_property",
  "resident_unit",
  "resident_lease",
]);

function successResponse(
  observability: ReturnType<typeof createRouteObservability>,
  body: unknown,
  init?: ResponseInit,
) {
  const headers = new Headers(init?.headers);
  for (const [name, value] of Object.entries(SUCCESS_HEADERS)) {
    headers.set(name, value);
  }
  return observability.correlate(NextResponse.json(body, { ...init, headers }));
}

function reject(
  observability: ReturnType<typeof createRouteObservability>,
  options: {
    status: number;
    code: Parameters<typeof apiErrorResponse>[0]["code"];
    message: string;
    event: string;
    context?: Record<string, unknown>;
  },
) {
  observability.logger.warn("document request rejected", observability.elapsed({
    event: options.event,
    ...options.context,
  }));
  return apiErrorResponse({
    status: options.status,
    code: options.code,
    message: options.message,
    requestId: observability.requestId,
  });
}

export async function GET(request: Request) {
  const observability = createRouteObservability(request, ROUTE);

  try {
    const user = await getCurrentUser();
    if (!user) {
      return reject(observability, {
        status: 401,
        code: API_ERROR_CODES.unauthorized,
        message: "Obehörig",
        event: "documents.list.unauthorized",
      });
    }

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
      loadLegacyRows(() => db.auditLog.findMany({
        where: { ...auditScopedWhere(user), entity_type: "document", action: "document.created" },
        orderBy: { created_at: "desc" },
        take: 500,
        select: { id: true, entity_id: true, metadata: true, created_at: true, actor: { select: { name: true, email: true } } },
      })),
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

    observability.logger.info("document list completed", observability.elapsed({
      event: "documents.list.completed",
      userId: user.id,
      companyId: user.company_id,
      returned: documents.length,
      modernCount: modern.length,
      legacyCount: legacy.length,
      includeLeases,
    }));

    return successResponse(observability, {
      documents,
      properties,
      leases,
      canManageLifecycle: Boolean(user.company_id && ["owner", "admin", "manager"].includes(user.role)),
    });
  } catch (error) {
    observability.logger.error("document list failed", error, observability.elapsed({
      event: "documents.list.failed",
    }));
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Internt serverfel",
      requestId: observability.requestId,
    });
  }
}

export async function POST(request: Request) {
  const observability = createRouteObservability(request, ROUTE);

  try {
    const user = await getCurrentUser();
    if (!user) {
      return reject(observability, {
        status: 401,
        code: API_ERROR_CODES.unauthorized,
        message: "Obehörig",
        event: "documents.create.unauthorized",
      });
    }
    if (!user.company_id) {
      return reject(observability, {
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Användaren saknar organisation",
        event: "documents.create.missing_company",
        context: { userId: user.id },
      });
    }
    if (!["owner", "admin", "manager"].includes(user.role)) {
      return reject(observability, {
        status: 403,
        code: API_ERROR_CODES.forbidden,
        message: "Du saknar behörighet att ladda upp dokument",
        event: "documents.create.forbidden",
        context: { userId: user.id, companyId: user.company_id },
      });
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

    const validationFailure = (message: string, reason: string) => reject(observability, {
      status: 400,
      code: API_ERROR_CODES.validationFailed,
      message,
      event: "documents.create.validation_failed",
      context: { reason, userId: user.id, companyId: user.company_id },
    });

    if (!(file instanceof File) || !name) return validationFailure("Dokumentnamn och fil krävs", "missing_file_or_name");
    if (name.length > 200 || category.length > 80) return validationFailure("Dokumentnamnet eller kategorin är för lång", "field_too_long");
    if (!allowedVisibilities.has(visibility)) return validationFailure("Ogiltig dokumentsynlighet", "invalid_visibility");

    const bytes = Buffer.from(await file.arrayBuffer());
    const validation = validateDocumentFile({ bytes, contentType: file.type, fileName: file.name, maxBytes: 2_000_000 });
    if (!validation.ok) return validationFailure(validation.error, "invalid_file");

    let resolvedPropertyId = propertyId || null;
    let resolvedUnitId = unitId || null;
    let resolvedLeaseId = leaseId || null;

    if (visibility === "resident_property" && !propertyId) return validationFailure("Fastighet krävs för denna synlighet", "missing_property");
    if (visibility === "resident_unit" && !unitId) return validationFailure("Objekt krävs för denna synlighet", "missing_unit");
    if (visibility === "resident_lease" && !leaseId) return validationFailure("Hyresavtal krävs för denna synlighet", "missing_lease");

    if (leaseId) {
      const lease = await db.lease.findFirst({ where: { id: leaseId, company_id: user.company_id, deleted_at: null, property: { deleted_at: null } }, select: { id: true, property_id: true, unit_id: true } });
      if (!lease) {
        return reject(observability, {
          status: 404,
          code: API_ERROR_CODES.notFound,
          message: "Hyresavtalet hittades inte",
          event: "documents.create.lease_not_found",
          context: { userId: user.id, companyId: user.company_id },
        });
      }
      resolvedLeaseId = lease.id;
      resolvedPropertyId = lease.property_id;
      resolvedUnitId = lease.unit_id;
    } else if (unitId) {
      const unit = await db.unit.findFirst({ where: { id: unitId, property: { company_id: user.company_id, deleted_at: null } }, select: { id: true, property_id: true } });
      if (!unit) {
        return reject(observability, {
          status: 404,
          code: API_ERROR_CODES.notFound,
          message: "Objektet hittades inte",
          event: "documents.create.unit_not_found",
          context: { userId: user.id, companyId: user.company_id },
        });
      }
      if (propertyId && propertyId !== unit.property_id) return validationFailure("Objektet tillhör inte den valda fastigheten", "unit_property_mismatch");
      resolvedUnitId = unit.id;
      resolvedPropertyId = unit.property_id;
    } else if (propertyId) {
      const property = await db.property.findFirst({ where: { id: propertyId, company_id: user.company_id, deleted_at: null }, select: { id: true } });
      if (!property) {
        return reject(observability, {
          status: 404,
          code: API_ERROR_CODES.notFound,
          message: "Fastigheten hittades inte",
          event: "documents.create.property_not_found",
          context: { userId: user.id, companyId: user.company_id },
        });
      }
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
      return reject(observability, {
        status: 503,
        code: API_ERROR_CODES.serviceUnavailable,
        message: "Fillagringen är inte konfigurerad",
        event: "documents.create.storage_unavailable",
        context: { userId: user.id, companyId: user.company_id },
      });
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

    observability.logger.info("document create completed", observability.elapsed({
      event: "documents.create.completed",
      userId: user.id,
      companyId: user.company_id,
      documentId: document.id,
    }));
    return successResponse(observability, { success: true, document }, { status: 201 });
  } catch (error) {
    if (error instanceof StorageConfigurationError) {
      observability.logger.error("document storage unavailable", error, observability.elapsed({
        event: "documents.create.storage_unavailable",
      }));
      return apiErrorResponse({
        status: 503,
        code: API_ERROR_CODES.serviceUnavailable,
        message: "Fillagringen är inte konfigurerad",
        requestId: observability.requestId,
      });
    }
    observability.logger.error("document create failed", error, observability.elapsed({
      event: "documents.create.failed",
    }));
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Internt serverfel",
      requestId: observability.requestId,
    });
  }
}

export async function PATCH(request: Request) {
  const observability = createRouteObservability(request, ROUTE);

  try {
    const user = await getCurrentUser();
    if (!user) {
      return reject(observability, {
        status: 401,
        code: API_ERROR_CODES.unauthorized,
        message: "Obehörig",
        event: "documents.update.unauthorized",
      });
    }
    if (!user.company_id) {
      return reject(observability, {
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Användaren saknar organisation",
        event: "documents.update.missing_company",
        context: { userId: user.id },
      });
    }

    const body = await request.json().catch(() => ({}));
    const documentId = String(body.documentId || body.id || "").trim();
    const validationFailure = (message: string, reason: string) => reject(observability, {
      status: 400,
      code: API_ERROR_CODES.validationFailed,
      message,
      event: "documents.update.validation_failed",
      context: { reason, userId: user.id, companyId: user.company_id },
    });
    if (!documentId) return validationFailure("Dokument-id krävs", "missing_document_id");

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
        return reject(observability, {
          status: 409,
          code: API_ERROR_CODES.conflict,
          message: "Dokumentet finns kvar i äldre lagring. Kör backfill till ManagedDocument innan det kan ändras.",
          event: "documents.update.legacy_conflict",
          context: { userId: user.id, companyId: user.company_id },
        });
      }
      return reject(observability, {
        status: 404,
        code: API_ERROR_CODES.notFound,
        message: "Dokumentet hittades inte",
        event: "documents.update.not_found",
        context: { userId: user.id, companyId: user.company_id },
      });
    }

    if (existing.lifecycle_state === "archived") {
      return reject(observability, {
        status: 409,
        code: API_ERROR_CODES.conflict,
        message: "Arkiverade dokument kan inte redigeras. Återställ först.",
        event: "documents.update.archived_conflict",
        context: { userId: user.id, companyId: user.company_id },
      });
    }

    const data: {
      name?: string;
      category?: string;
      visibility?: string;
      valid_until?: Date | null;
    } = {};

    if (body.name !== undefined) {
      const name = String(body.name || "").trim();
      if (!name || name.length > 200) return validationFailure("Dokumentnamn krävs och får vara max 200 tecken", "invalid_name");
      data.name = name;
    }
    if (body.category !== undefined) {
      const category = String(body.category || "").trim() || "other";
      if (category.length > 80) return validationFailure("Kategorin är för lång", "category_too_long");
      data.category = category;
    }
    if (body.visibility !== undefined) {
      const visibility = String(body.visibility || "").trim();
      if (!allowedVisibilities.has(visibility)) return validationFailure("Ogiltig synlighet", "invalid_visibility");
      // Keep existing property/unit/lease targeting; only allow visibility flips that do not
      // require new parent resolution in this field PATCH.
      if (
        (visibility === "resident_property" || visibility === "resident_unit" || visibility === "resident_lease") &&
        existing.visibility === "internal"
      ) {
        return validationFailure("Byt synlighet till boende via ny uppladdning eller behåll befintlig målgrupp.", "targeting_required");
      }
      data.visibility = visibility;
    }
    if (body.validUntil !== undefined) {
      const raw = String(body.validUntil || "").trim();
      data.valid_until = raw ? parseOptionalDate(raw) : null;
      if (raw && !data.valid_until) return validationFailure("Ogiltigt giltighetsdatum", "invalid_valid_until");
    }

    if (Object.keys(data).length === 0) return validationFailure("Inga fält att uppdatera", "no_fields");

    const updated = await db.managedDocument.updateMany({
      where: { id: existing.id, company_id: user.company_id },
      data,
    });
    if (updated.count === 0) {
      return reject(observability, {
        status: 404,
        code: API_ERROR_CODES.notFound,
        message: "Dokumentet hittades inte",
        event: "documents.update.not_found_after_write",
        context: { userId: user.id, companyId: user.company_id },
      });
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

    observability.logger.info("document update completed", observability.elapsed({
      event: "documents.update.completed",
      userId: user.id,
      companyId: user.company_id,
      documentId: existing.id,
    }));
    return successResponse(observability, { success: true, id: existing.id });
  } catch (error) {
    observability.logger.error("document update failed", error, observability.elapsed({
      event: "documents.update.failed",
    }));
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Internt serverfel",
      requestId: observability.requestId,
    });
  }
}
