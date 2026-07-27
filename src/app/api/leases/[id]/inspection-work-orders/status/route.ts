import { NextResponse } from "next/server";
import { canViewLeasingData, getCurrentUser } from "@/lib/current-user";
import { readInspectionWorkOrders } from "@/lib/read-inspection-work-orders";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  if (!canViewLeasingData(user.role)) {
    return NextResponse.json({ error: "Du saknar behörighet att visa leasingdata" }, { status: 403 });
  }
  const { id } = await params;
  const links = await readInspectionWorkOrders(user.company_id, id);
  return NextResponse.json({ links });
}
