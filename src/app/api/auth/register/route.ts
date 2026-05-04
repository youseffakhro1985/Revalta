import { NextResponse } from "next/server";
import db from "@/lib/db";
import { hashPassword } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const { name, email, password, companyName, phone } = await request.json();
    
    if (!email || !password || !companyName) {
      return NextResponse.json({ error: "Företagsnamn, e-post och lösenord krävs" }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Lösenordet måste vara minst 8 tecken" }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await db.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      return NextResponse.json({ error: "E-postadressen används redan" }, { status: 400 });
    }

    const hashedPassword = await hashPassword(password);
    const [firstName = "", ...lastNameParts] = String(name || "").trim().split(" ");
    const lastName = lastNameParts.join(" ") || "Administratör";

    const result = await db.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          companyName: companyName.trim(),
          email: normalizedEmail,
          phone: phone || null,
          status: "active",
          approvedAt: new Date(),
        },
      });

      const user = await tx.user.create({
        data: {
          firstName: firstName || "Konto",
          lastName,
          email: normalizedEmail,
          phone: phone || null,
          passwordHash: hashedPassword,
          role: "company_owner",
          status: "active",
          emailVerifiedAt: new Date(),
        },
      });

      await tx.companyMember.create({
        data: {
          companyId: company.id,
          userId: user.id,
          role: "company_owner",
          status: "active",
          joinedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          companyId: company.id,
          entityType: "company",
          entityId: company.id,
          action: "company_registered",
          newValues: JSON.stringify({ companyName: company.companyName, email: normalizedEmail }),
        },
      });

      return { company, user };
    });

    return NextResponse.json({ success: true, companyId: result.company.id }, { status: 201 });
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
