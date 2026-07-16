import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ error: "Inte implementerad" }, { status: 501 });
}
