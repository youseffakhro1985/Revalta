import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canAssignWorkOrders, canManageTickets, getCurrentUser, requireCompanyUser } from "@/lib/current-user";
import {
  hasWorkOrderVendorContractColumn,
  isMissingSchemaColumnError,
  notDeletedFilter,
  schemaMismatchUserMessage,
} from "@/lib/schema-readiness";
import { createLogger } from "@/lib/structured-logger";
import { listAssignableVendorContracts } from "@/lib/work-order-vendor";

const logger = createLogger({ route: "/api/work-orders/options" });

export async function GET() {
  try {
    const rawUser = await getCurrentUser();
    if (!rawUser) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    const user = requireCompanyUser(rawUser);
    if (!user) return NextResponse.json({ error: "En aktiv organisation och personalbehörighet krävs" }, { status: 403 });
    if (!canManageTickets(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att skapa arbetsordrar" }, { status: 403 });
    }

    const propertyActive = await notDeletedFilter("Property");
    const canAssign = canAssignWorkOrders(user.role);
    const persistVendor = await hasWorkOrderVendorContractColumn();
    const [properties, users, vendors] = await Promise.all([
      db.property.findMany({
        where: { company_id: user.company_id, status: "active", ...propertyActive },
        orderBy: [{ name: "asc" }, { address: "asc" }],
        select: {
          id: true,
          name: true,
          address: true,
          city: true,
          buildings: {
            orderBy: { name: "asc" },
            select: { id: true, name: true, address: true },
          },
          units: {
            where: { status: "active" },
            orderBy: { designation: "asc" },
            select: { id: true, designation: true, unit_type: true, building_id: true },
          },
        },
      }),
      canAssign
        ? db.user.findMany({
            where: { company_id: user.company_id, status: "active" },
            orderBy: [{ name: "asc" }, { email: "asc" }],
            select: { id: true, name: true, email: true, role: true },
          })
        : Promise.resolve([]),
      canAssign ? listAssignableVendorContracts(db, user.company_id) : Promise.resolve([]),
    ]);

    return NextResponse.json(
      {
        properties,
        users,
        vendors,
        permissions: { canAssign, vendorAssignmentAvailable: persistVendor },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    logger.error("Get work-order options error", error);
    if (isMissingSchemaColumnError(error)) {
      return NextResponse.json({ error: schemaMismatchUserMessage() }, { status: 503 });
    }
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
