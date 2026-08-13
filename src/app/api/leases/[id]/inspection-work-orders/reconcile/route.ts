import { NextResponse } from "next/server";
import { canManageLeases, getCurrentUser } from "@/lib/current-user";
import { InspectionRecordSyncError, reconcileInspectionRecord } from "@/lib/reconcile-inspection-record";
import { createLogger } from "@/lib/structured-logger";

const logger = createLogger({ route: "/api/leases/[id]/inspection-work-orders/reconcile" });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageLeases(user.role)) return NextResponse.json({ error: "Du saknar behörighet att uppdatera besiktningen" }, { status: 403 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const body = await request.json().catch(() => null) as { version?: unknown } | null;
    if (!body || !Number.isFinite(Number(body.version))) return NextResponse.json({ error: "Besiktningsversion saknas" }, { status: 400 });
    const { id } = await params;
    const result = await reconcileInspectionRecord({
      companyId: user.company_id,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      leaseId: id,
      version: Number(body.version),
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof InspectionRecordSyncError) return NextResponse.json({ error: error.message }, { status: error.status });
    logger.error("Reconcile inspection work orders error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
