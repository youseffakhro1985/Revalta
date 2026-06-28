import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { getCurrentUser } from "@/lib/current-user";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });

    return NextResponse.json({ user });
  } catch (error) {
    console.error("Get profile settings error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });

    const { name } = await request.json();
    const normalizedName = typeof name === "string" && name.trim() ? name.trim() : null;

    const updatedUser = await db.user.update({
      where: { id: user.id },
      data: { name: normalizedName },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        email_verified_at: true,
      },
    });

    await writeAuditLog(user, {
      entityType: "user",
      entityId: user.id,
      action: "settings.profile_updated",
      metadata: { name: normalizedName },
    });

    return NextResponse.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error("Update profile settings error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
