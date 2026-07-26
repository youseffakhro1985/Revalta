import { NextResponse } from "next/server";
import db from "@/lib/db";
import { auditScopedWhere, getCurrentUser } from "@/lib/current-user";
import { safeDocumentFileName } from "@/lib/document-file-security";

function contentDisposition(fileName: string) {
  const safeAscii = fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
  return `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });

    const { id } = await params;
    const log = await db.auditLog.findFirst({
      where: {
        id,
        ...auditScopedWhere(user),
        entity_type: "document",
        action: "document.created",
      },
      select: { metadata: true },
    });
    if (!log) return NextResponse.json({ error: "Dokumentet hittades inte" }, { status: 404 });

    const metadata = (log.metadata || {}) as Record<string, unknown>;
    const dataUrl = typeof metadata.dataUrl === "string" ? metadata.dataUrl : null;
    if (!dataUrl?.startsWith("data:")) {
      return NextResponse.json({ error: "Dokumentfilen saknas" }, { status: 404 });
    }

    const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(dataUrl);
    if (!match) return NextResponse.json({ error: "Dokumentfilen är ogiltig" }, { status: 404 });

    const contentType = typeof metadata.contentType === "string" ? metadata.contentType : match[1];
    const fileName = safeDocumentFileName(
      typeof metadata.fileName === "string" ? metadata.fileName : "dokument",
    );
    const bytes = Buffer.from(match[2], "base64");

    return new Response(bytes, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": contentDisposition(fileName),
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Download document error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
