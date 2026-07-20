import { NextResponse } from "next/server";
import { canManageTickets, getCurrentUser } from "@/lib/current-user";
import { createInspectionWorkOrders, InspectionWorkOrderError } from "@/lib/create-inspection-work-orders";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet att skapa arbetsorder" }, { status: 403 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const body = await request.json().catch(() => null) as { version?: unknown; itemIds?: unknown } | null;
    if (!body || !Array.isArray(body.itemIds)) return NextResponse.json({ error: "Välj besiktningspunkter" }, { status: 400 });
    const { id } = await params;
    const result = await createInspectionWorkOrders({
      companyId: user.company_id,
      userId: user.id,
      leaseId: id,
      version: Number(body.version),
      itemIds: body.itemIds.filter((value): value is string => typeof value === "string"),
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof InspectionWorkOrderError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Create inspection work orders error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
