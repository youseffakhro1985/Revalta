import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { auditScopedWhere, getCurrentUser } from "@/lib/current-user";
import { safeDocumentFileName } from "@/lib/document-file-security";
import { getStorageToken } from "@/lib/storage";

function contentDisposition(fileName: string) {
  const safeAscii = fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
  return `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function isTrustedLegacyBlobUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}

async function streamFromStorage(storageUrl: string, headers: Record<string, string>) {
  const token = getStorageToken();
  if (!token) return NextResponse.json({ error: "Fillagringen är inte konfigurerad" }, { status: 503 });

  try {
    const blob = await get(storageUrl, { access: "private", token });
    if (blob) return new Response(blob.stream, { headers });
  } catch (error) {
    if (!isTrustedLegacyBlobUrl(storageUrl)) throw error;
  }

  if (!isTrustedLegacyBlobUrl(storageUrl)) {
    return NextResponse.json({ error: "Dokumentfilen saknas" }, { status: 404 });
  }

  const legacyResponse = await fetch(storageUrl, { cache: "no-store" });
  if (!legacyResponse.ok || !legacyResponse.body) {
    return NextResponse.json({ error: "Dokumentfilen saknas" }, { status: 404 });
  }
  return new Response(legacyResponse.body, { headers });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });

    const { id } = await params;
    if (user.company_id) {
      const modern = await db.managedDocument.findFirst({
        where: { id, company_id: user.company_id },
        select: {
          file_name: true,
          content_type: true,
          storage_url: true,
          data_url: true,
        },
      });
      if (modern) {
        const headers = {
          "Content-Type": modern.content_type,
          "Content-Disposition": contentDisposition(safeDocumentFileName(modern.file_name)),
          "Cache-Control": "private, no-store, max-age=0",
          "X-Content-Type-Options": "nosniff",
        };
        if (modern.storage_url) return streamFromStorage(modern.storage_url, headers);
        if (modern.data_url?.startsWith("data:")) {
          const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(modern.data_url);
          if (!match) return NextResponse.json({ error: "Dokumentfilen är ogiltig" }, { status: 404 });
          const bytes = Buffer.from(match[2], "base64");
          return new Response(bytes, {
            headers: { ...headers, "Content-Length": String(bytes.length) },
          });
        }
        return NextResponse.json({ error: "Dokumentfilen saknas" }, { status: 404 });
      }
    }

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
    const contentType = typeof metadata.contentType === "string" ? metadata.contentType : "application/octet-stream";
    const fileName = safeDocumentFileName(
      typeof metadata.fileName === "string" ? metadata.fileName : "dokument",
    );
    const headers = {
      "Content-Type": contentType,
      "Content-Disposition": contentDisposition(fileName),
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    };

    const storageUrl = typeof metadata.storageUrl === "string" ? metadata.storageUrl : null;
    if (storageUrl) return streamFromStorage(storageUrl, headers);

    const dataUrl = typeof metadata.dataUrl === "string" ? metadata.dataUrl : null;
    if (!dataUrl?.startsWith("data:")) {
      return NextResponse.json({ error: "Dokumentfilen saknas" }, { status: 404 });
    }

    const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(dataUrl);
    if (!match) return NextResponse.json({ error: "Dokumentfilen är ogiltig" }, { status: 404 });

    const bytes = Buffer.from(match[2], "base64");
    return new Response(bytes, {
      headers: {
        ...headers,
        "Content-Type": typeof metadata.contentType === "string" ? metadata.contentType : match[1],
        "Content-Length": String(bytes.length),
      },
    });
  } catch (error) {
    console.error("Download document error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
