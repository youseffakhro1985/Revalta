import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { auditScopedWhere, canManageTickets, getCurrentUser } from "@/lib/current-user";
import { NextResponse } from "next/server";

const entityType = "vendor_contract";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });

    const rows = await db.auditLog.findMany({
      where: {
        ...auditScopedWhere(user),
        entity_type: entityType,
      },
      orderBy: { created_at: "desc" },
      take: 200,
      select: { id: true, created_at: true, metadata: true },
    });

    return NextResponse.json({
      vendors: rows.map((row) => ({
        id: row.id,
        created_at: row.created_at,
        ...(row.metadata as Record<string, unknown>),
      })),
    });
  } catch (error) {
    console.error("Get vendors error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageTickets(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
    }

    const body = await request.json();
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ error: "Leverantörsnamn krävs" }, { status: 400 });

    const contractValue = Number(body.contractValue || 0);
    const noticeMonths = Number(body.noticeMonths || 0);
    if (!Number.isFinite(contractValue) || contractValue < 0 || !Number.isFinite(noticeMonths) || noticeMonths < 0) {
      return NextResponse.json({ error: "Kontrollera avtalsvärde och uppsägningstid" }, { status: 400 });
    }

    const metadata = {
      name,
      orgNumber: String(body.orgNumber || "").trim(),
      category: String(body.category || "Övrigt"),
      contactName: String(body.contactName || "").trim(),
      email: String(body.email || "").trim(),
      phone: String(body.phone || "").trim(),
      contractTitle: String(body.contractTitle || "").trim(),
      contractValue,
      startDate: body.startDate ? String(body.startDate) : "",
      endDate: body.endDate ? String(body.endDate) : "",
      noticeMonths,
      propertyId: body.propertyId ? String(body.propertyId) : "",
      status: "active",
    };

    const entityId = crypto.randomUUID();
    await writeAuditLog(user, {
      entityType,
      entityId,
      action: "vendor_contract.created",
      metadata,
    });

    return NextResponse.json({ vendor: { id: entityId, ...metadata } }, { status: 201 });
  } catch (error) {
    console.error("Create vendor error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
