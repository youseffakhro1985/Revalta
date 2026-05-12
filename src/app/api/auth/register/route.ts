import { NextResponse } from "next/server";
import db from "@/lib/db";
import { hashPassword } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const { firstName, lastName, email, password } = await request.json();
    
    if (!email || !password) {
      return NextResponse.json({ error: "E-post och lösenord krävs" }, { status: 400 });
    }

    const existingUser = await db.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json({ error: "E-postadressen används redan" }, { status: 400 });
    }

    const hashedPassword = await hashPassword(password);

    await db.user.create({
      data: { 
        email, 
        passwordHash: hashedPassword, 
        firstName: firstName || "", 
        lastName: lastName || ""
      }
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json({ error: "Serverfel" }, { status: 500 });
  }
}
