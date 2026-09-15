import db from "@/lib/db";
import { getDocumentLifecycleMap } from "@/lib/document-lifecycle";
import { loadLegacyRows } from "@/lib/dual-list";
import {
  canAccessResidentPortal,
  isResident,
  type CompanyUser,
} from "@/lib/current-user";
import { leaseHolderEmailMatch } from "@/lib/resident-portal-scope";

const residentDocumentVisibilities = new Set(["resident_all", "resident_property", "resident_unit", "resident_lease"]);
const activeLeaseStatuses = ["active", "notice"];

type DocumentMetadata = {
  name?: unknown;
  category?: unknown;
  visibility?: unknown;
  propertyId?: unknown;
  unitId?: unknown;
  leaseId?: unknown;
  validUntil?: unknown;
  fileName?: unknown;
  contentType?: unknown;
  sizeBytes?: unknown;
  dataUrl?: unknown;
  storageUrl?: unknown;
  storage?: unknown;
};

export type ResidentPortalDocumentLease = {
  id: string;
  lease_number: string;
  status: string;
  property: { id: string; name: string; address: string; city: string };
  unit: { id: string; designation: string; unit_type: string };
  lease_holder: { id: string; name: string; contact_name: string | null };
};

export type ResidentPortalDocument = {
  id: string;
  name: string;
  category: string;
  visibility: string;
  validUntil: string | null;
  fileName: string | null;
  contentType: string | null;
  sizeBytes: number;
  downloadable: boolean;
  accessibleLeaseIds: string[];
  uploadedBy: string;
  createdAt: string;
};

export type ResidentPortalDocumentsState = {
  leases: ResidentPortalDocumentLease[];
  documents: ResidentPortalDocument[];
  isResident: boolean;
};

function accessibleLeaseIdsForDocument(
  leases: Array<{ id: string; property_id: string; unit_id: string }>,
  visibility: string,
  propertyId: string | null,
  unitId: string | null,
  leaseId: string | null,
) {
  return leases.filter((lease) => {
    if (visibility === "resident_all") return true;
    if (visibility === "resident_property") return Boolean(propertyId && lease.property_id === propertyId);
    if (visibility === "resident_unit") return Boolean(unitId && lease.unit_id === unitId);
    if (visibility === "resident_lease") return Boolean(leaseId && lease.id === leaseId);
    return false;
  }).map((lease) => lease.id);
}

function serializeCreatedAt(value: Date | string) {
  return value instanceof Date ? value.toISOString() : String(value);
}

export async function loadResidentPortalDocuments(
  user: CompanyUser,
): Promise<ResidentPortalDocumentsState | null> {
  if (!canAccessResidentPortal(user.role)) return null;

  const residentView = isResident(user.role);
  const leaseScope = residentView
    ? { lease_holder: leaseHolderEmailMatch(user.email) }
    : {};

  const [leases, managedDocuments, documentLogs] = await Promise.all([
    db.lease.findMany({
      where: {
        company_id: user.company_id,
        deleted_at: null,
        status: { in: [...activeLeaseStatuses] },
        property: { deleted_at: null },
        ...leaseScope,
      },
      orderBy: [{ property: { name: "asc" } }, { unit: { designation: "asc" } }],
      take: 1000,
      select: {
        id: true,
        lease_number: true,
        status: true,
        property_id: true,
        unit_id: true,
        property: { select: { id: true, name: true, address: true, city: true } },
        unit: { select: { id: true, designation: true, unit_type: true } },
        lease_holder: { select: { id: true, name: true, contact_name: true, email: true, phone: true, party_type: true } },
      },
    }),
    db.managedDocument.findMany({
      where: {
        company_id: user.company_id,
        lifecycle_state: "active",
        visibility: { in: [...residentDocumentVisibilities] },
        OR: [{ property_id: null }, { property: { deleted_at: null } }],
      },
      orderBy: { created_at: "desc" },
      take: 500,
      include: { created_by: { select: { name: true, email: true } } },
    }),
    loadLegacyRows(() => db.auditLog.findMany({
      where: { company_id: user.company_id, entity_type: "document", action: "document.created" },
      orderBy: { created_at: "desc" },
      take: 500,
      select: { id: true, entity_id: true, metadata: true, created_at: true, actor: { select: { name: true, email: true } } },
    })),
  ]);

  const modernIds = new Set(managedDocuments.map((row) => row.id));
  const lifecycleMap = documentLogs.length > 0
    ? await getDocumentLifecycleMap(
        user.company_id,
        documentLogs.map((log) => log.id).filter((id) => !modernIds.has(id)),
      )
    : new Map();

  const modernDocuments = managedDocuments.flatMap((row) => {
    const accessibleLeaseIds = accessibleLeaseIdsForDocument(
      leases,
      row.visibility,
      row.property_id,
      row.unit_id,
      row.lease_id,
    );
    if (accessibleLeaseIds.length === 0) return [];
    return [{
      id: row.id,
      name: row.name,
      category: row.category,
      visibility: row.visibility,
      validUntil: row.valid_until?.toISOString().slice(0, 10) || null,
      fileName: row.file_name,
      contentType: row.content_type,
      sizeBytes: row.size_bytes,
      downloadable: Boolean(row.storage_url || row.data_url?.startsWith("data:")),
      accessibleLeaseIds,
      uploadedBy: row.created_by?.name || row.created_by?.email || "Förvaltningen",
      createdAt: serializeCreatedAt(row.created_at),
    }];
  });

  const legacyDocuments = documentLogs.flatMap((log) => {
    const metadata = (log.metadata || {}) as DocumentMetadata;
    if (metadata.storage === "ManagedDocument") return [];
    if (modernIds.has(log.id) || (log.entity_id && modernIds.has(log.entity_id))) return [];
    if (lifecycleMap.get(log.id)?.state !== "active") return [];
    const visibility = typeof metadata.visibility === "string" ? metadata.visibility : "internal";
    if (!residentDocumentVisibilities.has(visibility)) return [];

    const propertyId = typeof metadata.propertyId === "string" ? metadata.propertyId : null;
    const unitId = typeof metadata.unitId === "string" ? metadata.unitId : null;
    const leaseId = typeof metadata.leaseId === "string" ? metadata.leaseId : null;
    const accessibleLeaseIds = accessibleLeaseIdsForDocument(leases, visibility, propertyId, unitId, leaseId);
    if (accessibleLeaseIds.length === 0) return [];

    const contentType = typeof metadata.contentType === "string" ? metadata.contentType : null;
    const dataUrl = typeof metadata.dataUrl === "string" ? metadata.dataUrl : null;
    const storageUrl = typeof metadata.storageUrl === "string" ? metadata.storageUrl : null;
    const downloadable = Boolean(
      storageUrl
      || (contentType && dataUrl?.startsWith(`data:${contentType};base64,`)),
    );

    return [{
      id: log.id,
      name: typeof metadata.name === "string" ? metadata.name : "Dokument",
      category: typeof metadata.category === "string" ? metadata.category : "other",
      visibility,
      validUntil: typeof metadata.validUntil === "string" ? metadata.validUntil : null,
      fileName: typeof metadata.fileName === "string" ? metadata.fileName : null,
      contentType,
      sizeBytes: typeof metadata.sizeBytes === "number" ? metadata.sizeBytes : 0,
      downloadable,
      accessibleLeaseIds,
      uploadedBy: log.actor?.name || log.actor?.email || "Förvaltningen",
      createdAt: serializeCreatedAt(log.created_at),
    }];
  });

  const documents = [...modernDocuments, ...legacyDocuments]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 500);

  return {
    leases: leases.map((lease) => ({
      id: lease.id,
      lease_number: lease.lease_number,
      status: lease.status,
      property: lease.property,
      unit: lease.unit,
      lease_holder: {
        id: lease.lease_holder.id,
        name: lease.lease_holder.name,
        contact_name: lease.lease_holder.contact_name,
      },
    })),
    documents,
    isResident: residentView,
  };
}
