import db from "@/lib/db";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ reference: string }> }
) {
  try {
    const ip = getClientIp(request);
    const rateLimit = await checkRateLimit(`public-track:${ip}`, 20, 60 * 60 * 1000);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: "För många försök. Vänta en stund och prova igen." }, { status: 429 });
    }

    const { reference } = await params;
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email")?.trim().toLowerCase();

    if (!reference || !email?.includes("@")) {
      return NextResponse.json({ error: "Referensnummer och e-post krävs" }, { status: 400 });
    }

    const ticket = await db.ticket.findFirst({
      where: {
        public_reference: reference.toUpperCase(),
        reporter_email: email,
      },
      select: {
        public_reference: true,
        title: true,
        status: true,
        priority: true,
        category: true,
        created_at: true,
        updated_at: true,
        ai_summary: true,
        property: { select: { name: true, address: true, city: true } },
        comments: {
          where: { is_internal: false },
          orderBy: { created_at: "asc" },
          select: {
            id: true,
            body: true,
            created_at: true,
            user: { select: { name: true } },
          },
        },
      },
    });

    if (!ticket) {
      return NextResponse.json({ error: "Ärendet hittades inte. Kontrollera referensnummer och e-post." }, { status: 404 });
    }

    return NextResponse.json({ ticket });
  } catch (error) {
    console.error("Get public ticket error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
