import { NextResponse } from "next/server";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { canManageTickets, getCurrentUser } from "@/lib/current-user";
import { generatePublicReference } from "@/lib/public-portal";
import { getDocumentLifecycleMap } from "@/lib/document-lifecycle";
import { hasStoredDocumentFile } from "@/lib/document-storage";

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
  storageUrl?: unknown;
  dataUrl?: unknown;
};

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const [leases, tickets, documentLogs] = await Promise.all([
      db.lease.findMany({
        where: { company_id: user.company_id, status: { in: activeLeaseStatuses } },
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
        where: { company_id: user.company_id, source: "resident_portal" },
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
      db.auditLog.findMany({
        where: { company_id: user.company_id, entity_type: "document", action: "document.created" },
        orderBy: { created_at: "desc" },
        take: 500,
        select: { id: true, metadata: true, created_at: true, actor: { select: { name: true, email: true } } },
      }),
    ]);

    const lifecycleMap = await getDocumentLifecycleMap(user.company_id, documentLogs.map((log) => log.id));
    const residentDocuments = documentLogs.flatMap((log) => {
      if (lifecycleMap.get(log.id)?.state !== "active") return [];
      const metadata = (log.metadata || {}) as DocumentMetadata;
      const visibility = typeof metadata.visibility === "string" ? metadata.visibility : "internal";
      if (!residentDocumentVisibilities.has(visibility)) return [];

      const propertyId = typeof metadata.propertyId === "string" ? metadata.propertyId : null;
      const unitId = typeof metadata.unitId === "string" ? metadata.unitId : null;
      const leaseId = typeof metadata.leaseId === "string" ? metadata.leaseId : null;
      const accessibleLeaseIds = leases.filter((lease) => {
        if (visibility === "resident_all") return true;
        if (visibility === "resident_property") return Boolean(propertyId && lease.property_id === propertyId);
        if (visibility === "resident_unit") return Boolean(unitId && lease.unit_id === unitId);
        if (visibility === "resident_lease") return Boolean(leaseId && lease.id === leaseId);
        return false;
      }).map((lease) => lease.id);

      if (accessibleLeaseIds.length === 0) return [];
      const contentType = typeof metadata.contentType === "string" ? metadata.contentType : null;
      const downloadable = hasStoredDocumentFile(metadata);

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
      }];
    });

    return NextResponse.json(
      {
        leases: leases.map((lease) => ({ ...lease, monthly_rent: Number(lease.monthly_rent) })),
        tickets,
        documents: residentDocuments,
        canManage: canManageTickets(user.role),
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
    if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "Ogiltig förfrågan" }, { status: 400 });

    const leaseId = String(body.leaseId || "").trim();
    const subject = String(body.subject || "").trim();
    const message = String(body.message || "").trim();
    const category = String(body.category || "other").trim();
    const priority = String(body.priority || "normal").trim();

    if (!leaseId || !subject || message.length < 10) return NextResponse.json({ error: "Hyresavtal, ämne och en tydlig beskrivning krävs" }, { status: 400 });
    if (subject.length > 200 || message.length > 5000) return NextResponse.json({ error: "Ämnet eller beskrivningen är för lång" }, { status: 400 });
    if (!allowedCategories.has(category) || !allowedPriorities.has(priority)) return NextResponse.json({ error: "Ogiltig kategori eller prioritet" }, { status: 400 });

    const lease = await db.lease.findFirst({
      where: { id: leaseId, company_id: user.company_id, status: { in: activeLeaseStatuses } },
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
          reporter_email: lease.lease_holder.email,
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
          },
        },
      });
      return created;
    });

    await writeAuditLog(user, {
      entityType: "lease",
      entityId: lease.id,
      action: "resident_portal.lease_ticket_linked",
      metadata: { ticketId: ticket.id, publicReference: ticket.public_reference },
    });

    return NextResponse.json({ ticket }, { status: 201 });
  } catch (error) {
    console.error("Create resident portal ticket error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
