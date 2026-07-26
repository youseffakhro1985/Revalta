import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageLeases, getCurrentUser } from "@/lib/current-user";
import { emptyInspectionRecord, parseInspectionRecord, type LeaseInspectionRecord } from "@/lib/lease-inspection-items";

const EVENT_TYPE = "lease_inspection_items";

async function getLease(id: string, companyId: string) {
  return db.lease.findFirst({
    where: { id, company_id: companyId, deleted_at: null },
    select: {
      id: true,
      lease_number: true,
      status: true,
      property: { select: { id: true, name: true, address: true, city: true } },
      unit: { select: { id: true, designation: true, unit_type: true } },
      lease_holder: { select: { id: true, name: true } },
    },
  });
}

async function loadRecordForRead(companyId: string, leaseId: string, actor: { id: string; name: string | null; email: string }) {
  const modern = await db.leaseInspectionRecord.findUnique({
    where: { company_id_lease_id: { company_id: companyId, lease_id: leaseId } },
    select: { payload: true },
  });
  if (modern?.payload && typeof modern.payload === "object") {
    return { record: modern.payload as unknown as LeaseInspectionRecord, source: "table" as const };
  }

  const event = await db.integrationEvent.findFirst({
    where: { company_id: companyId, type: EVENT_TYPE, recipient: leaseId },
    orderBy: { created_at: "desc" },
  });
  if (event?.payload && typeof event.payload === "object") {
    return { record: event.payload as unknown as LeaseInspectionRecord, source: "legacy" as const };
  }
  return { record: emptyInspectionRecord(actor), source: "table" as const };
}

/** Mutation path: modern first; IE-only → 409 (no rematerialize); neither → empty for first create. */
async function loadRecordForMutation(companyId: string, leaseId: string, actor: { id: string; name: string | null; email: string }) {
  const modern = await db.leaseInspectionRecord.findUnique({
    where: { company_id_lease_id: { company_id: companyId, lease_id: leaseId } },
    select: { payload: true },
  });
  if (modern?.payload && typeof modern.payload === "object") {
    return { record: modern.payload as unknown as LeaseInspectionRecord } as const;
  }

  const legacy = await db.integrationEvent.findFirst({
    where: { company_id: companyId, type: EVENT_TYPE, recipient: leaseId },
    orderBy: { created_at: "desc" },
    select: { id: true },
  });
  if (legacy) {
    return {
      error: "Besiktningen finns kvar i äldre lagring. Kör backfill till LeaseInspectionRecord innan den kan uppdateras.",
      status: 409 as const,
    };
  }
  return { record: emptyInspectionRecord(actor) } as const;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const { id } = await params;
    const lease = await getLease(id, user.company_id);
    if (!lease) return NextResponse.json({ error: "Avtalet hittades inte" }, { status: 404 });

    const { record, source } = await loadRecordForRead(user.company_id, id, { id: user.id, name: user.name, email: user.email });
    return NextResponse.json({ lease, record, source, permissions: { canManage: canManageLeases(user.role) } });
  } catch (error) {
    console.error("Get lease inspection items error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageLeases(user.role)) return NextResponse.json({ error: "Du saknar behörighet att hantera besiktningar" }, { status: 403 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const { id } = await params;
    const lease = await getLease(id, user.company_id);
    if (!lease) return NextResponse.json({ error: "Avtalet hittades inte" }, { status: 404 });

    const loaded = await loadRecordForMutation(user.company_id, id, { id: user.id, name: user.name, email: user.email });
    if ("error" in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status });

    const previous = loaded.record;
    const parsed = parseInspectionRecord(await request.json().catch(() => null), previous, { id: user.id, name: user.name, email: user.email });
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: parsed.status });

    const record = parsed.data;
    const actionRequired = record.items.filter((item) => item.condition === "action_required" && !item.resolved).length;
    const status = actionRequired > 0 ? "action_required" : "recorded";

    await db.$transaction(async (tx) => {
      await tx.leaseInspectionRecord.upsert({
        where: { company_id_lease_id: { company_id: user.company_id!, lease_id: id } },
        create: {
          company_id: user.company_id!,
          lease_id: id,
          status,
          version: record.version,
          payload: record as unknown as Prisma.InputJsonValue,
          created_by_id: user.id,
          updated_by_id: user.id,
        },
        update: {
          status,
          version: record.version,
          payload: record as unknown as Prisma.InputJsonValue,
          updated_by_id: user.id,
        },
      });

      await tx.auditLog.create({
        data: {
          company_id: user.company_id!,
          actor_user_id: user.id,
          entity_type: "lease_inspection",
          entity_id: id,
          action: "lease_inspection.items_updated",
          metadata: {
            leaseNumber: lease.lease_number,
            version: record.version,
            itemCount: record.items.length,
            actionRequired,
            selectedForWorkOrder: record.items.filter((item) => item.selectedForWorkOrder && !item.resolved).length,
            storage: "LeaseInspectionRecord",
          },
        },
      });
    });

    return NextResponse.json({ record });
  } catch (error) {
    console.error("Update lease inspection items error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
