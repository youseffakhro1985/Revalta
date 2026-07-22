import { get } from "@vercel/blob";
import db from "@/lib/db";
import { getCurrentUser, tenantWhere } from "@/lib/current-user";
import { getStorageToken } from "@/lib/storage";
import { NextResponse } from "next/server";

function contentDisposition(fileName: string) {
  const safeAscii = fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
  return `inline; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });

    const { id } = await params;
    const attachment = await db.ticketAttachment.findFirst({
      where: { id, ticket: tenantWhere(user) },
      select: { file_name: true, content_type: true, data_url: true },
    });

    if (!attachment) return NextResponse.json({ error: "Bilagan hittades inte" }, { status: 404 });

    const headers = new Headers({
      "Content-Type": attachment.content_type,
      "Content-Disposition": contentDisposition(attachment.file_name),
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    });

    if (attachment.data_url.startsWith("data:")) {
      const encoded = attachment.data_url.split(",", 2)[1];
      if (!encoded) return NextResponse.json({ error: "Bilagan är skadad" }, { status: 500 });
      return new Response(Buffer.from(encoded, "base64"), { headers });
    }

    const token = getStorageToken();
    if (!token) {
      return NextResponse.json({ error: "Fillagringen är inte konfigurerad" }, { status: 503 });
    }

    const blob = await get(attachment.data_url, {
      access: "private",
      token,
    });
    if (!blob) return NextResponse.json({ error: "Bilagan hittades inte i fillagringen" }, { status: 404 });

    return new Response(blob.stream, { headers });
  } catch (error) {
    console.error("Download attachment error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
