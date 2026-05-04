import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import db from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import { v4 as uuidv4 } from "uuid";

async function getUserFromRequest() {
  const token = cookies().get("token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function GET() {
  try {
    const user = await getUserFromRequest();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });

    const tickets = db.prepare("SELECT * FROM tickets WHERE user_id = ? ORDER BY created_at DESC").all(user.sub);
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
    if (!title || !description) {
      return NextResponse.json({ error: "Titel och beskrivning krävs" }, { status: 400 });
    }

    const id = uuidv4();
    db.prepare("INSERT INTO tickets (id, title, description, user_id) VALUES (?, ?, ?, ?)").run(
      id, title, description, user.sub
    );

    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (error) {
    console.error("Create ticket error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
