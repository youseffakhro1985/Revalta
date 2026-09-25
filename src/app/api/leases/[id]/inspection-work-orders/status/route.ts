import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canViewLeasingData, getCurrentUser, requireCompanyUser } from "@/lib/current-user";
import { readInspectionWorkOrders } from "@/lib/read-inspection-work-orders";

async function getLease(id: string, companyId: string) {
  return db.lease.findFirst({
    where: { id, company_id: companyId, deleted_at: null, property: { deleted_at: null } },
    select: { id: true },
  });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rawUser = await getCurrentUser();
  if (!rawUser) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  const user = requireCompanyUser(rawUser);
  if (!user) return NextResponse.json({ error: "En aktiv organisation och personalbehörighet krävs" }, { status: 403 });
  if (!canViewLeasingData(user.role)) {
    return NextResponse.json({ error: "Du saknar behörighet att visa leasingdata" }, { status: 403 });
  }
  const { id } = await params;
  const lease = await getLease(id, user.company_id);
  if (!lease) return NextResponse.json({ error: "Avtalet hittades inte" }, { status: 404 });
  const links = await readInspectionWorkOrders(user.company_id, id);
  return NextResponse.json({ links });
}
