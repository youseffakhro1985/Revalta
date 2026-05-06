import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import db from "@/lib/db";
import { verifyToken } from "@/lib/session";

async function getUserFromRequest() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserFromRequest();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    const { id } = await params;

    const ticket = await db.ticket.findFirst({
      where: {
        id,
        user_id: user.sub,
      },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        created_at: true,
      },
    });

    if (!ticket) {
      return NextResponse.json({ error: "Ärendet hittades inte" }, { status: 404 });
    }

    return NextResponse.json({ ticket });
  } catch (error) {
    console.error("Get ticket error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
