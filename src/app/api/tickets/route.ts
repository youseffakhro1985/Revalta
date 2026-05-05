import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import db from "@/lib/db";
import { verifyToken, TokenPayload } from "@/lib/auth";

const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 5000;

async function getUserFromRequest(): Promise<TokenPayload | null> {
  const token = cookies().get("token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function GET() {
  try {
    const user = await getUserFromRequest();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });

    const tickets = await db.ticket.findMany({
      where: { user_id: user.sub },
      orderBy: { created_at: 'desc' }
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

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Ogiltig förfrågan" }, { status: 400 });
    }

    const { title, description } = body;

    if (!title || !description) {
      return NextResponse.json({ error: "Titel och beskrivning krävs" }, { status: 400 });
    }

    const trimmedTitle = title.trim().slice(0, MAX_TITLE_LENGTH);
    const trimmedDescription = description.trim().slice(0, MAX_DESCRIPTION_LENGTH);

    if (!trimmedTitle || !trimmedDescription) {
      return NextResponse.json({ error: "Titel och beskrivning får inte vara tomma" }, { status: 400 });
    }

    const ticket = await db.ticket.create({
      data: { title: trimmedTitle, description: trimmedDescription, user_id: user.sub }
    });

    return NextResponse.json({ success: true, id: ticket.id }, { status: 201 });
  } catch (error) {
    console.error("Create ticket error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
