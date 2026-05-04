import { NextResponse } from "next/server";
import db from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { v4 as uuidv4 } from "uuid";

export async function POST(request: Request) {
  try {
    const { name, email, password } = await request.json();
    
    if (!email || !password) {
      return NextResponse.json({ error: "E-post och lösenord krävs" }, { status: 400 });
    }

    // Kolla om användaren redan finns
    const existingUser = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (existingUser) {
      return NextResponse.json({ error: "E-postadressen används redan" }, { status: 400 });
    }

    const hashedPassword = await hashPassword(password);
    const id = uuidv4();

    db.prepare("INSERT INTO users (id, email, password, name) VALUES (?, ?, ?, ?)").run(
      id, email, hashedPassword, name
    );

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
