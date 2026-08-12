import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canAssignWorkOrders, canManageTickets, getCurrentUser } from "@/lib/current-user";
import {
  isMissingSchemaColumnError,
  notDeletedFilter,
  schemaMismatchUserMessage,
} from "@/lib/schema-readiness";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageTickets(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att skapa arbetsordrar" }, { status: 403 });
    }
    if (!user.company_id) {
      return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
    }

    const propertyActive = await notDeletedFilter("Property");
    const canAssign = canAssignWorkOrders(user.role);
    const [properties, users] = await Promise.all([
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
    ]);

    return NextResponse.json(
      { properties, users, permissions: { canAssign } },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Get work-order options error:", error);
    if (isMissingSchemaColumnError(error)) {
      return NextResponse.json({ error: schemaMismatchUserMessage() }, { status: 503 });
    }
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
