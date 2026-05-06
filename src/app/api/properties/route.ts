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

export async function GET() {
  try {
    const user = await getUserFromRequest();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });

    const properties = await db.property.findMany({
      where: { user_id: user.sub },
      orderBy: { created_at: "desc" },
      include: {
        _count: {
          select: { tickets: true },
        },
      },
    });

    return NextResponse.json({ properties });
  } catch (error) {
    console.error("Get properties error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getUserFromRequest();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });

    const { name, address, postalCode, city } = await request.json();
    const normalizedName = typeof name === "string" ? name.trim() : "";
    const normalizedAddress = typeof address === "string" ? address.trim() : "";
    const normalizedPostalCode = typeof postalCode === "string" ? postalCode.trim() : null;
    const normalizedCity = typeof city === "string" ? city.trim() : "";

    if (!normalizedName || !normalizedAddress || !normalizedCity) {
      return NextResponse.json({ error: "Namn, adress och ort krävs" }, { status: 400 });
    }

    const property = await db.property.create({
      data: {
        name: normalizedName,
        address: normalizedAddress,
        postal_code: normalizedPostalCode,
        city: normalizedCity,
        user_id: user.sub,
      },
      include: {
        _count: {
          select: { tickets: true },
        },
      },
    });

    return NextResponse.json({ success: true, property }, { status: 201 });
  } catch (error) {
    console.error("Create property error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
