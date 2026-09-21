import { NextResponse } from "next/server";
import { canViewLeasingData, getCurrentUser, requireCompanyUser } from "@/lib/current-user";
import { readInspectionWorkOrders } from "@/lib/read-inspection-work-orders";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rawUser = await getCurrentUser();
  if (!rawUser) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  const user = requireCompanyUser(rawUser);
  if (!user) return NextResponse.json({ error: "En aktiv organisation och personalbehörighet krävs" }, { status: 403 });
  if (!canViewLeasingData(user.role)) {
    return NextResponse.json({ error: "Du saknar behörighet att visa leasingdata" }, { status: 403 });
  }
  const { id } = await params;
  const links = await readInspectionWorkOrders(user.company_id, id);
  return NextResponse.json({ links });
}
