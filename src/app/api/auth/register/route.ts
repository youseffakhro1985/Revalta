import { NextResponse } from "next/server";
import db from "@/lib/db";
import { hashPassword } from "@/lib/auth";

const MIN_PASSWORD_LENGTH = 8;
const MAX_EMAIL_LENGTH = 255;
const MAX_NAME_LENGTH = 100;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Ogiltig förfrågan" }, { status: 400 });
    }

    const { name, email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ error: "E-post och lösenord krävs" }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (normalizedEmail.length > MAX_EMAIL_LENGTH) {
      return NextResponse.json({ error: "E-postadressen är för lång" }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return NextResponse.json({ error: "Ogiltig e-postadress" }, { status: 400 });
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Lösenordet måste vara minst ${MIN_PASSWORD_LENGTH} tecken` },
        { status: 400 }
      );
    }

    const trimmedName = name ? name.trim().slice(0, MAX_NAME_LENGTH) : null;

    const existingUser = await db.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      return NextResponse.json({ error: "E-postadressen används redan" }, { status: 400 });
    }

    const hashedPassword = await hashPassword(password);

    await db.user.create({
      data: { email: normalizedEmail, password: hashedPassword, name: trimmedName }
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
