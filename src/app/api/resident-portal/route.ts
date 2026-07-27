import { NextResponse } from "next/server";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import {
  canAccessResidentPortal,
  canCreateResidentPortalTicket,
  canManageResidentPortal,
  getCurrentUser,
  isResident,
} from "@/lib/current-user";
import { generatePublicReference } from "@/lib/public-portal";
import { getDocumentLifecycleMap } from "@/lib/document-lifecycle";
import { leaseHolderEmailMatch, reporterEmailMatch } from "@/lib/resident-portal-scope";
import { isModernStorageOnly } from "@/lib/dual-list";
import { normalizeEmail } from "@/lib/security";

const allowedCategories = new Set(["maintenance", "plumbing", "electrical", "heating", "access", "noise", "other"]);
const allowedPriorities = new Set(["low", "normal", "high", "urgent"]);
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

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
    if (!canAccessResidentPortal(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet till boendeportalen" }, { status: 403 });
    }

    const residentView = isResident(user.role);
    const leaseScope = residentView
      ? { lease_holder: leaseHolderEmailMatch(user.email) }
      : {};
    const ticketScope = residentView
      ? { reporter_email: reporterEmailMatch(user.email) }
      : {};

    const [leases, tickets, managedDocuments, documentLogs] = await Promise.all([
      db.lease.findMany({
        where: {
          company_id: user.company_id,
          deleted_at: null,
          status: { in: activeLeaseStatuses },
          property: { deleted_at: null },
          ...leaseScope,
        },
        orderBy: [{ property: { name: "asc" } }, { unit: { designation: "asc" } }],
        take: 1000,
        select: {
          id: true,
          lease_number: true,
          status: true,
          start_date: true,
          end_date: true,
          monthly_rent: true,
          property_id: true,
          unit_id: true,
          property: { select: { id: true, name: true, address: true, city: true } },
          unit: { select: { id: true, designation: true, unit_type: true } },
          lease_holder: { select: { id: true, name: true, contact_name: true, email: true, phone: true, party_type: true } },
        },
      }),
      db.ticket.findMany({
        where: {
          company_id: user.company_id,
          source: "resident_portal",
          deleted_at: null,
          OR: [{ property_id: null }, { property: { deleted_at: null } }],
          ...ticketScope,
        },
        orderBy: { created_at: "desc" },
        take: 500,
        select: {
          id: true,
          public_reference: true,
          title: true,
          description: true,
          status: true,
          category: true,
          priority: true,
          reporter_name: true,
          reporter_email: true,
          reporter_phone: true,
          reporter_unit: true,
          created_at: true,
          updated_at: true,
          property: { select: { id: true, name: true } },
          assigned_to: { select: { id: true, name: true, email: true } },
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
      isModernStorageOnly()
        ? Promise.resolve([])
        : db.auditLog.findMany({
            where: { company_id: user.company_id, entity_type: "document", action: "document.created" },
            orderBy: { created_at: "desc" },
            take: 500,
            select: { id: true, entity_id: true, metadata: true, created_at: true, actor: { select: { name: true, email: true } } },
          }),
    ]);

    const modernIds = new Set(managedDocuments.map((row) => row.id));
    const lifecycleMap = user.company_id && documentLogs.length > 0
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
        propertyId: row.property_id,
        unitId: row.unit_id,
        leaseId: row.lease_id,
        accessibleLeaseIds,
        uploadedBy: row.created_by?.name || row.created_by?.email || "Förvaltningen",
        createdAt: row.created_at,
        source: "table" as const,
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
        propertyId,
        unitId,
        leaseId,
        accessibleLeaseIds,
        uploadedBy: log.actor?.name || log.actor?.email || "Förvaltningen",
        createdAt: log.created_at,
        source: "legacy" as const,
      }];
    });

    const documents = [...modernDocuments, ...legacyDocuments]
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .slice(0, 500);

    return NextResponse.json(
      {
        leases: leases.map((lease) => ({ ...lease, monthly_rent: Number(lease.monthly_rent) })),
        tickets,
        documents,
        canManage: canManageResidentPortal(user.role),
        canCreate: canCreateResidentPortalTicket(user.role),
        isResident: residentView,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Get resident portal workspace error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
    if (!canCreateResidentPortalTicket(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "Ogiltig förfrågan" }, { status: 400 });

    const leaseId = String(body.leaseId || "").trim();
    const subject = String(body.subject || "").trim();
    const message = String(body.message || "").trim();
    const category = String(body.category || "other").trim();
    const priority = String(body.priority || "normal").trim();
    const residentView = isResident(user.role);

    if (!leaseId || !subject || message.length < 10) return NextResponse.json({ error: "Hyresavtal, ämne och en tydlig beskrivning krävs" }, { status: 400 });
    if (subject.length > 200 || message.length > 5000) return NextResponse.json({ error: "Ämnet eller beskrivningen är för lång" }, { status: 400 });
    if (!allowedCategories.has(category) || !allowedPriorities.has(priority)) return NextResponse.json({ error: "Ogiltig kategori eller prioritet" }, { status: 400 });

    const lease = await db.lease.findFirst({
      where: {
        id: leaseId,
        company_id: user.company_id,
        deleted_at: null,
        status: { in: activeLeaseStatuses },
        property: { deleted_at: null },
        ...(residentView ? { lease_holder: leaseHolderEmailMatch(user.email) } : {}),
      },
      select: {
        id: true,
        lease_number: true,
        property_id: true,
        unit: { select: { designation: true } },
        lease_holder: { select: { id: true, name: true, contact_name: true, email: true, phone: true } },
      },
    });
    if (!lease) return NextResponse.json({ error: "Det aktiva hyresavtalet hittades inte" }, { status: 404 });

    const reporterName = lease.lease_holder.contact_name || lease.lease_holder.name;
    const reporterEmail = residentView
      ? normalizeEmail(user.email)
      : (lease.lease_holder.email || normalizeEmail(user.email) || null);

    const ticket = await db.$transaction(async (tx) => {
      const created = await tx.ticket.create({
        data: {
          title: subject,
          description: message,
          status: "new",
          category,
          priority,
          company_id: user.company_id,
          user_id: user.id,
          property_id: lease.property_id,
          public_reference: generatePublicReference(),
          source: "resident_portal",
          reporter_name: reporterName,
          reporter_email: reporterEmail,
          reporter_phone: lease.lease_holder.phone,
          reporter_unit: lease.unit.designation,
        },
        select: { id: true, public_reference: true },
      });

      await tx.auditLog.create({
        data: {
          actor_user_id: user.id,
          company_id: user.company_id,
          action: "resident_portal.ticket_created",
          entity_type: "ticket",
          entity_id: created.id,
          metadata: {
            leaseId: lease.id,
            leaseNumber: lease.lease_number,
            leaseHolderId: lease.lease_holder.id,
            propertyId: lease.property_id,
            unit: lease.unit.designation,
            category,
            priority,
            publicReference: created.public_reference,
            accessMode: residentView ? "resident_self_service" : "staff",
          },
        },
      });
      return created;
    });

    await writeAuditLog(user, {
      entityType: "lease",
      entityId: lease.id,
      action: "resident_portal.lease_ticket_linked",
      metadata: {
        ticketId: ticket.id,
        publicReference: ticket.public_reference,
        accessMode: residentView ? "resident_self_service" : "staff",
      },
    });

    return NextResponse.json({ ticket }, { status: 201 });
  } catch (error) {
    console.error("Create resident portal ticket error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
