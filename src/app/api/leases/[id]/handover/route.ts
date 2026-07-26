import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageLeases, getCurrentUser } from "@/lib/current-user";
import { emptyHandover, parseHandoverInput, type LeaseHandoverPayload } from "@/lib/lease-handover";

const EVENT_TYPE = "lease_handover_record";

async function getLease(id: string, companyId: string) {
  return db.lease.findFirst({
    where: { id, company_id: companyId },
    select: {
      id: true,
      lease_number: true,
      status: true,
      start_date: true,
      end_date: true,
      notice_date: true,
      ended_at: true,
      property: { select: { id: true, name: true, address: true, city: true } },
      unit: { select: { id: true, designation: true, unit_type: true } },
      lease_holder: { select: { id: true, name: true, email: true, phone: true } },
    },
  });
}

async function loadHandover(companyId: string, leaseId: string, actor: { id: string; name: string | null; email: string }) {
  const modern = await db.leaseHandoverRecord.findUnique({
    where: { company_id_lease_id: { company_id: companyId, lease_id: leaseId } },
    select: { payload: true, status: true, version: true },
  });
  if (modern?.payload && typeof modern.payload === "object") {
    return modern.payload as unknown as LeaseHandoverPayload;
  }

  const event = await db.integrationEvent.findFirst({
    where: { company_id: companyId, type: EVENT_TYPE, recipient: leaseId },
    orderBy: { created_at: "desc" },
  });
  if (event?.payload && typeof event.payload === "object") {
    return event.payload as unknown as LeaseHandoverPayload;
  }
  return emptyHandover(actor);
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const { id } = await params;
    const lease = await getLease(id, user.company_id);
    if (!lease) return NextResponse.json({ error: "Avtalet hittades inte" }, { status: 404 });

    const handover = await loadHandover(user.company_id, id, { id: user.id, name: user.name, email: user.email });
    const history = await db.auditLog.findMany({
      where: { company_id: user.company_id, entity_type: "lease_handover", entity_id: id },
      orderBy: { created_at: "desc" },
      take: 50,
      include: { actor: { select: { name: true, email: true } } },
    });

    return NextResponse.json({ lease, handover, history, permissions: { canManage: canManageLeases(user.role) } });
  } catch (error) {
    console.error("Get lease handover error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageLeases(user.role)) return NextResponse.json({ error: "Du saknar behörighet att hantera överlämningar" }, { status: 403 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const { id } = await params;
    const lease = await getLease(id, user.company_id);
    if (!lease) return NextResponse.json({ error: "Avtalet hittades inte" }, { status: 404 });

    const previous = await loadHandover(user.company_id, id, { id: user.id, name: user.name, email: user.email });
    const parsed = parseHandoverInput(await request.json().catch(() => null), previous, { id: user.id, name: user.name, email: user.email });
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: parsed.status });

    const handover = parsed.data;
    const status = handover.completedAt ? "completed" : "in_progress";
    const completedAt = handover.completedAt ? new Date(handover.completedAt) : null;

    await db.$transaction(async (tx) => {
      await tx.leaseHandoverRecord.upsert({
        where: { company_id_lease_id: { company_id: user.company_id!, lease_id: id } },
        create: {
          company_id: user.company_id!,
          lease_id: id,
          status,
          version: handover.version,
          payload: handover as unknown as Prisma.InputJsonValue,
          completed_at: completedAt,
          created_by_id: user.id,
          updated_by_id: user.id,
        },
        update: {
          status,
          version: handover.version,
          payload: handover as unknown as Prisma.InputJsonValue,
          completed_at: completedAt,
          updated_by_id: user.id,
        },
      });

      await tx.auditLog.create({
        data: {
          company_id: user.company_id!,
          actor_user_id: user.id,
          entity_type: "lease_handover",
          entity_id: id,
          action: handover.completedAt && !previous.completedAt ? "lease_handover.completed" : "lease_handover.updated",
          metadata: {
            leaseNumber: lease.lease_number,
            mode: handover.mode,
            version: handover.version,
            completedAt: handover.completedAt,
            keyRecords: handover.keys.length,
            inspectionStatus: handover.inspection.status,
            storage: "LeaseHandoverRecord",
          },
        },
      });
    });

    return NextResponse.json({ handover });
  } catch (error) {
    console.error("Update lease handover error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
