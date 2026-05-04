import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST() {
  cookies().set("token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 0,
    path: "/",
  });

  return NextResponse.json({ success: true });
}
