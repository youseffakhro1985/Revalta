import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser, type CompanyUser } from "@/lib/current-user";
import { isOperationalDocumentAccessible } from "@/lib/operational-document-access";
import { getStorageToken } from "@/lib/storage";
import { createLogger } from "@/lib/structured-logger";

const logger = createLogger({ route: "/api/operational-documents/[id]/download" });

function contentDisposition(fileName: string) {
  const safeAscii = fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
  return `inline; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function isTrustedLegacyBlobUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const { id } = await params;
    const document = await db.operationalDocument.findFirst({
      where: { id, company_id: user.company_id, deleted_at: null },
      select: {
        file_name: true,
        storage_url: true,
        content_type: true,
        work_order_id: true,
        project_id: true,
        property_id: true,
        technical_asset_id: true,
      },
    });
    if (!document) return NextResponse.json({ error: "Dokumentet hittades inte" }, { status: 404 });
    if (!(await isOperationalDocumentAccessible(user as CompanyUser, document))) {
      return NextResponse.json({ error: "Dokumentet hittades inte" }, { status: 404 });
    }

    const token = getStorageToken();
    if (!token) return NextResponse.json({ error: "Fillagringen är inte konfigurerad" }, { status: 503 });

    const headers = new Headers({
      "Content-Type": document.content_type,
      "Content-Disposition": contentDisposition(document.file_name),
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    });

    try {
      const blob = await get(document.storage_url, { access: "private", token });
      if (blob) return new Response(blob.stream, { headers });
    } catch (error) {
      if (!isTrustedLegacyBlobUrl(document.storage_url)) throw error;
    }

    if (!isTrustedLegacyBlobUrl(document.storage_url)) {
      return NextResponse.json({ error: "Dokumentet hittades inte i fillagringen" }, { status: 404 });
    }

    const legacyResponse = await fetch(document.storage_url, { cache: "no-store" });
    if (!legacyResponse.ok || !legacyResponse.body) {
      return NextResponse.json({ error: "Dokumentet hittades inte i fillagringen" }, { status: 404 });
    }
    return new Response(legacyResponse.body, { headers });
  } catch (error) {
    logger.error("Download operational document error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
