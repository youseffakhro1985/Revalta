import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import db from "@/lib/db";
import { verifyToken } from "@/lib/auth";

async function getUserFromRequest() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function GET() {
  try {
    const user = await getUserFromRequest();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });

    const tickets = await db.ticket.findMany({
      where: { user_id: user.sub },
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        created_at: true,
      },
    });
    return NextResponse.json({ tickets });
  } catch (error) {
    console.error("Get tickets error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getUserFromRequest();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });

    const { title, description } = await request.json();
    const normalizedTitle = typeof title === "string" ? title.trim() : "";
    const normalizedDescription = typeof description === "string" ? description.trim() : "";

    if (!normalizedTitle || !normalizedDescription) {
      return NextResponse.json({ error: "Titel och beskrivning krävs" }, { status: 400 });
    }

    const ticket = await db.ticket.create({
      data: {
        title: normalizedTitle,
        description: normalizedDescription,
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

    return NextResponse.json({ success: true, ticket }, { status: 201 });
  } catch (error) {
    console.error("Create ticket error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
