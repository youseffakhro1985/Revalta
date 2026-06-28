import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { canManageCompany, getCurrentUser } from "@/lib/current-user";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!user.company_id) return NextResponse.json({ error: "Företag saknas" }, { status: 400 });

    const company = await db.company.findUnique({
      where: { id: user.company_id },
      select: { id: true, name: true, org_number: true, plan: true, status: true, created_at: true },
    });

    return NextResponse.json({ company, canManage: canManageCompany(user.role) });
  } catch (error) {
    console.error("Get company settings error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!user.company_id || !canManageCompany(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att ändra organisationen" }, { status: 403 });
    }

    const { name, orgNumber } = await request.json();
    const normalizedName = typeof name === "string" ? name.trim() : "";
    const normalizedOrgNumber = typeof orgNumber === "string" && orgNumber.trim() ? orgNumber.trim() : null;
    if (!normalizedName) {
      return NextResponse.json({ error: "Organisationsnamn krävs" }, { status: 400 });
    }

    const company = await db.company.update({
      where: { id: user.company_id },
      data: { name: normalizedName, org_number: normalizedOrgNumber },
      select: { id: true, name: true, org_number: true, plan: true, status: true, created_at: true },
    });

    await writeAuditLog(user, {
      entityType: "company",
      entityId: company.id,
      action: "settings.company_updated",
      metadata: { name: company.name, orgNumber: company.org_number },
    });

    return NextResponse.json({ success: true, company });
  } catch (error) {
    console.error("Update company settings error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
