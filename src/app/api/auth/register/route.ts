import { NextResponse } from "next/server";
import db from "@/lib/db";
import { createResetToken, hashPassword, hashResetToken } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { queueTicketNotification } from "@/lib/integrations";

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const rateLimit = checkRateLimit(`register:${ip}`, 5, 60 * 60 * 1000);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: "För många registreringar. Vänta en stund och prova igen." }, { status: 429 });
    }

    const { name, email, password, companyName } = await request.json();
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    const normalizedName = typeof name === "string" ? name.trim() : null;
    const normalizedCompanyName =
      typeof companyName === "string" && companyName.trim()
        ? companyName.trim()
        : normalizedName
          ? `${normalizedName}s bolag`
          : "Mitt företag";
    
    if (!normalizedEmail || typeof password !== "string" || password.length < 6) {
      return NextResponse.json({ error: "E-post och minst 6 tecken i lösenord krävs" }, { status: 400 });
    }

    if (!normalizedEmail.includes("@")) {
      return NextResponse.json({ error: "E-post och lösenord krävs" }, { status: 400 });
    }

    const existingUser = await db.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      return NextResponse.json({ error: "E-postadressen används redan" }, { status: 400 });
    }

    const hashedPassword = await hashPassword(password);

    const company = await db.company.create({
      data: {
        name: normalizedCompanyName,
        users: {
          create: {
            email: normalizedEmail,
            password: hashedPassword,
            name: normalizedName,
            role: "owner",
          },
        },
      },
      include: {
        users: {
          select: { id: true, email: true, company_id: true },
        },
      },
    });

    const owner = company.users[0];
    if (owner) {
      const verifyToken = createResetToken();
      await db.emailVerificationToken.create({
        data: {
          user_id: owner.id,
          token_hash: hashResetToken(verifyToken),
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      await writeAuditLog(owner, {
        entityType: "company",
        entityId: company.id,
        action: "company.created",
        metadata: { companyName: normalizedCompanyName },
      });
      await queueTicketNotification(owner, {
        ticketId: owner.id,
        title: "Verifiera e-postadress",
        recipient: owner.email,
        event: "email_verification",
      });

      const verifyUrl = `${new URL(request.url).origin}/verify-email?token=${verifyToken}`;
      return NextResponse.json({
        success: true,
        verifyUrl: process.env.EMAIL_PROVIDER_API_KEY ? undefined : verifyUrl,
      }, { status: 201 });
    }

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
