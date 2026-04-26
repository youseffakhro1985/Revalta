import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getAllTickets, createTicket } from "@/lib/tickets";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Ej autentiserad" }, { status: 401 });
  }
  const tickets = getAllTickets();
  return NextResponse.json(tickets);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Ej autentiserad" }, { status: 401 });
  }

  const body = await req.json();
  const { title, description, propertyAddress } = body;

  if (!title || !description || !propertyAddress) {
    return NextResponse.json({ error: "Alla fält krävs" }, { status: 400 });
  }

  const ticket = createTicket({
    title,
    description,
    propertyAddress,
    status: "open",
    createdBy: session.email || "Okänd",
  });

  return NextResponse.json(ticket, { status: 201 });
}
