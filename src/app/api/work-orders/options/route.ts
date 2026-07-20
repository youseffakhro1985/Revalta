import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageTickets, getCurrentUser } from "@/lib/current-user";

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

    const [properties, users] = await Promise.all([
      db.property.findMany({
        where: { company_id: user.company_id, status: "active" },
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
      db.user.findMany({
        where: { company_id: user.company_id, status: "active" },
        orderBy: [{ name: "asc" }, { email: "asc" }],
        select: { id: true, name: true, email: true, role: true },
      }),
    ]);

    return NextResponse.json(
      { properties, users },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Get work-order options error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
