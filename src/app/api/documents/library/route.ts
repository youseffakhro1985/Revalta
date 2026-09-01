import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import db from "@/lib/db";
import { canViewLeasingData, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { createRouteObservability } from "@/lib/route-observability";
import { parseDocumentLibraryQuery } from "@/lib/document-library-query";

const ROUTE = "/api/documents/library";
const SUCCESS_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

const documentSelect = {
  id: true,
  property_id: true,
  unit_id: true,
  lease_id: true,
  name: true,
  category: true,
  visibility: true,
  valid_until: true,
  file_name: true,
  content_type: true,
  size_bytes: true,
  lifecycle_state: true,
  created_at: true,
  updated_at: true,
  created_by: { select: { name: true, email: true } },
} satisfies Prisma.ManagedDocumentSelect;

type DocumentRow = Prisma.ManagedDocumentGetPayload<{ select: typeof documentSelect }>;

function successResponse(observability: ReturnType<typeof createRouteObservability>, body: unknown) {
  const headers = new Headers(SUCCESS_HEADERS);
  return observability.correlate(NextResponse.json(body, { headers }));
}

function orderByFor(sort: ReturnType<typeof parseDocumentLibraryQuery>["sort"]): Prisma.ManagedDocumentOrderByWithRelationInput[] {
  if (sort === "oldest") return [{ created_at: "asc" }, { id: "asc" }];
  if (sort === "name") return [{ name: "asc" }, { created_at: "desc" }];
  if (sort === "expiry") return [{ valid_until: { sort: "asc", nulls: "last" } }, { created_at: "desc" }];
  return [{ created_at: "desc" }, { id: "desc" }];
}

export async function GET(request: Request) {
  const observability = createRouteObservability(request, ROUTE);

  try {
    const user = await getCurrentUser();
    if (!user) {
      return apiErrorResponse({
        status: 401,
        code: API_ERROR_CODES.unauthorized,
        message: "Obehörig",
        requestId: observability.requestId,
      });
    }
    if (!user.company_id) {
      return apiErrorResponse({
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Användaren saknar organisation",
        requestId: observability.requestId,
      });
    }

    // Explicit rollback keeps the original dual-read endpoint available.
    if (process.env.REVALTA_MODERN_STORAGE_ONLY === "0") {
      return apiErrorResponse({
        status: 409,
        code: API_ERROR_CODES.conflict,
        message: "Dokumentbiblioteket kör tillfälligt i kompatibilitetsläge",
        requestId: observability.requestId,
      });
    }

    const companyId = user.company_id;
    const query = parseDocumentLibraryQuery(request.url);
    const attentionCutoff = new Date(Date.now() + 60 * 86_400_000);
    const baseWhere: Prisma.ManagedDocumentWhereInput = {
      company_id: companyId,
      OR: [{ property_id: null }, { property: { deleted_at: null } }],
    };
    const filters: Prisma.ManagedDocumentWhereInput[] = [];

    if (query.search) {
      filters.push({
        OR: [
          { name: { contains: query.search, mode: "insensitive" } },
          { file_name: { contains: query.search, mode: "insensitive" } },
          { created_by: { OR: [
            { name: { contains: query.search, mode: "insensitive" } },
            { email: { contains: query.search, mode: "insensitive" } },
          ] } },
          { property: { OR: [
            { name: { contains: query.search, mode: "insensitive" } },
            { address: { contains: query.search, mode: "insensitive" } },
            { city: { contains: query.search, mode: "insensitive" } },
          ] } },
        ],
      });
    }
    if (query.category) filters.push({ category: query.category });
    if (query.propertyId) filters.push({ property_id: query.propertyId });
    if (query.visibility) filters.push({ visibility: query.visibility });
    if (query.lifecycle) filters.push({ lifecycle_state: query.lifecycle });

    if (query.focus === "attention") {
      filters.push({ lifecycle_state: "active", valid_until: { lte: attentionCutoff } });
    } else if (query.focus === "resident") {
      filters.push({ lifecycle_state: "active", visibility: { not: "internal" } });
    } else if (query.focus === "internal") {
      filters.push({ lifecycle_state: "active", visibility: "internal" });
    } else if (query.focus === "archived") {
      filters.push({ lifecycle_state: "archived" });
    }

    const filteredWhere: Prisma.ManagedDocumentWhereInput = filters.length
      ? { ...baseWhere, AND: filters }
      : baseWhere;
    const includeLeases = canViewLeasingData(user.role);

    const [
      total,
      totalDocuments,
      lifecycleGroups,
      residentPublished,
      attentionCount,
      categoryGroups,
      propertyGroups,
      properties,
      leases,
    ] = await Promise.all([
      db.managedDocument.count({ where: filteredWhere }),
      db.managedDocument.count({ where: baseWhere }),
      db.managedDocument.groupBy({
        by: ["lifecycle_state"],
        where: baseWhere,
        _count: { _all: true },
      }),
      db.managedDocument.count({
        where: { ...baseWhere, lifecycle_state: "active", visibility: { not: "internal" } },
      }),
      db.managedDocument.count({
        where: { ...baseWhere, lifecycle_state: "active", valid_until: { lte: attentionCutoff } },
      }),
      db.managedDocument.groupBy({
        by: ["category"],
        where: { ...baseWhere, lifecycle_state: { not: "archived" } },
        _count: { _all: true },
      }),
      db.managedDocument.groupBy({
        by: ["property_id"],
        where: { ...baseWhere, property_id: { not: null }, lifecycle_state: { not: "archived" } },
        _count: { _all: true },
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
      includeLeases
        ? db.lease.findMany({
            where: { company_id: companyId, deleted_at: null, property: { deleted_at: null } },
            orderBy: { lease_number: "asc" },
            take: 2_000,
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

    const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
    const page = Math.min(query.page, totalPages);

    const [rows, recentRows, attentionRows] = await Promise.all([
      db.managedDocument.findMany({
        where: filteredWhere,
        orderBy: orderByFor(query.sort),
        skip: (page - 1) * query.pageSize,
        take: query.pageSize,
        select: documentSelect,
      }),
      db.managedDocument.findMany({
        where: baseWhere,
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        take: 4,
        select: documentSelect,
      }),
      db.managedDocument.findMany({
        where: { ...baseWhere, lifecycle_state: "active", valid_until: { lte: attentionCutoff } },
        orderBy: [{ valid_until: "asc" }, { created_at: "desc" }],
        take: 5,
        select: documentSelect,
      }),
    ]);

    const propertyMap = new Map(properties.map((property) => [property.id, property]));
    const leaseMap = new Map(leases.map((lease) => [lease.id, lease]));

    const mapDocument = (row: DocumentRow) => {
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
    };

    const propertyRows = propertyGroups
      .flatMap((group) => {
        if (!group.property_id) return [];
        const property = propertyMap.get(group.property_id);
        return property ? [{ id: property.id, name: property.name, count: group._count._all }] : [];
      })
      .sort((left, right) => right.count - left.count)
      .slice(0, 5);

    const categoryRows = categoryGroups
      .map((group) => ({ category: group.category || "other", count: group._count._all }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 7);

    const summary = {
      total: totalDocuments,
      active: lifecycleGroups.find((group) => group.lifecycle_state === "active")?._count._all ?? 0,
      unpublished: lifecycleGroups.find((group) => group.lifecycle_state === "unpublished")?._count._all ?? 0,
      archived: lifecycleGroups.find((group) => group.lifecycle_state === "archived")?._count._all ?? 0,
      residentPublished,
      attention: attentionCount,
    };

    observability.logger.info("document library list completed", observability.elapsed({
      event: "documents.library.completed",
      userId: user.id,
      companyId,
      page,
      pageSize: query.pageSize,
      total,
      sort: query.sort,
      focus: query.focus,
    }));

    return successResponse(observability, {
      documents: rows.map(mapDocument),
      properties,
      leases,
      summary,
      categoryRows,
      propertyRows,
      recentDocuments: recentRows.map(mapDocument),
      attentionDocuments: attentionRows.map(mapDocument),
      pagination: { page, pageSize: query.pageSize, total, totalPages },
      canManageLifecycle: ["owner", "admin", "manager"].includes(user.role),
    });
  } catch (error) {
    observability.logger.error("document library list failed", error, observability.elapsed({
      event: "documents.library.failed",
    }));
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Internt serverfel",
      requestId: observability.requestId,
    });
  }
}
