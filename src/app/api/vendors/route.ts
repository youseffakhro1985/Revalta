import db from "@/lib/db";
import { getCurrentUser, tenantWhere } from "@/lib/current-user";
import { NextResponse } from "next/server";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });

  const rows = await db.auditLog.findMany({
    where: { entity_type: "vendor_contract", ...tenantWhere(user) },
    orderBy: { created_at: "desc" },
    take: 200,
  });

  return NextResponse.json({
    vendors: rows.map((row) => ({ id: row.id, created_at: row.created_at, ...(row.metadata as Record<string, unknown>) })),
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });

  const body = await request.json();
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ error: "Leverantörsnamn krävs" }, { status: 400 });

  const metadata = {
    name,
    orgNumber: String(body.orgNumber || "").trim(),
    category: String(body.category || "Övrigt"),
    contactName: String(body.contactName || "").trim(),
    email: String(body.email || "").trim(),
    phone: String(body.phone || "").trim(),
    contractTitle: String(body.contractTitle || "").trim(),
    contractValue: Number(body.contractValue || 0),
    startDate: body.startDate || null,
    endDate: body.endDate || null,
    noticeMonths: Number(body.noticeMonths || 0),
    propertyId: body.propertyId || null,
    status: "active",
  };

  const row = await db.auditLog.create({
    data: {
      company_id: user.company_id,
      user_id: user.id,
      entity_type: "vendor_contract",
      entity_id: crypto.randomUUID(),
      action: "vendor_contract.created",
      metadata,
    },
  });

  return NextResponse.json({ vendor: { id: row.id, created_at: row.created_at, ...metadata } }, { status: 201 });
}
