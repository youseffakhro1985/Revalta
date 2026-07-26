import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canViewOperations, getCurrentUser } from "@/lib/current-user";
import { getDocumentLifecycleState } from "@/lib/document-lifecycle";
import { allowedDocumentContentTypes, safeDocumentFileName, validateDocumentFile } from "@/lib/document-file-security";
import { getStorageToken } from "@/lib/storage";

const activeLeaseStatuses = ["active", "notice"];
const residentDocumentVisibilities = new Set([
  "resident_all",
  "resident_property",
  "resident_unit",
  "resident_lease",
]);

type DocumentMetadata = {
  name?: unknown;
  visibility?: unknown;
  propertyId?: unknown;
  unitId?: unknown;
  leaseId?: unknown;
  fileName?: unknown;
  contentType?: unknown;
  sizeBytes?: unknown;
  dataUrl?: unknown;
  storageUrl?: unknown;
  storage?: unknown;
};

function documentAccessibleToLease(
  visibility: string,
  scope: { propertyId: string | null; unitId: string | null; leaseId: string | null },
  lease: { id: string; property_id: string; unit_id: string },
) {
  if (visibility === "resident_all") return true;
  if (visibility === "resident_property") return scope.propertyId === lease.property_id;
  if (visibility === "resident_unit") return scope.unitId === lease.unit_id;
  if (visibility === "resident_lease") return scope.leaseId === lease.id;
  return false;
}

function isTrustedLegacyBlobUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}

async function bytesFromStorage(storageUrl: string) {
  const token = getStorageToken();
  if (!token) throw new Error("storage_unconfigured");

  try {
    const blob = await get(storageUrl, { access: "private", token });
    if (blob?.stream) {
      const response = new Response(blob.stream);
      return Buffer.from(await response.arrayBuffer());
    }
  } catch (error) {
    if (!isTrustedLegacyBlobUrl(storageUrl)) throw error;
  }

  if (!isTrustedLegacyBlobUrl(storageUrl)) return null;
  const legacyResponse = await fetch(storageUrl, { cache: "no-store" });
  if (!legacyResponse.ok) return null;
  return Buffer.from(await legacyResponse.arrayBuffer());
}

function bytesFromDataUrl(dataUrl: string, contentType: string) {
  const prefix = `data:${contentType};base64,`;
  if (!dataUrl.startsWith(prefix) && !dataUrl.startsWith("data:")) return null;
  const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(dataUrl);
  if (!match) return null;
  return Buffer.from(match[2], "base64");
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
    if (!canViewOperations(user.role)) return NextResponse.json({ error: "Du saknar behörighet till boendedokument" }, { status: 403 });

    const { id } = await params;
    const leaseId = new URL(request.url).searchParams.get("leaseId")?.trim() || "";
    if (!leaseId) return NextResponse.json({ error: "Hyresavtal krävs" }, { status: 400 });

    const lease = await db.lease.findFirst({
      where: {
        id: leaseId,
        company_id: user.company_id,
        deleted_at: null,
        status: { in: activeLeaseStatuses },
        property: { deleted_at: null },
      },
      select: { id: true, property_id: true, unit_id: true, lease_number: true },
    });
    if (!lease) return NextResponse.json({ error: "Dokumentet hittades inte" }, { status: 404 });

    const modern = await db.managedDocument.findFirst({
      where: { id, company_id: user.company_id },
      select: {
        id: true,
        name: true,
        visibility: true,
        property_id: true,
        unit_id: true,
        lease_id: true,
        file_name: true,
        content_type: true,
        size_bytes: true,
        storage_url: true,
        data_url: true,
        lifecycle_state: true,
      },
    });

    let documentId = "";
    let visibility = "";
    let contentType = "";
    let fileName = "dokument";
    let expectedSize: number | null = null;
    let bytes: Buffer | null = null;

    if (modern) {
      if (modern.lifecycle_state !== "active") {
        return NextResponse.json({ error: "Dokumentet är inte längre publicerat" }, { status: 410 });
      }
      visibility = modern.visibility;
      if (
        !residentDocumentVisibilities.has(visibility)
        || !documentAccessibleToLease(visibility, {
          propertyId: modern.property_id,
          unitId: modern.unit_id,
          leaseId: modern.lease_id,
        }, lease)
      ) {
        return NextResponse.json({ error: "Du saknar behörighet till dokumentet" }, { status: 403 });
      }

      documentId = modern.id;
      contentType = modern.content_type;
      fileName = modern.file_name || modern.name;
      expectedSize = modern.size_bytes;
      if (modern.storage_url) {
        try {
          bytes = await bytesFromStorage(modern.storage_url);
        } catch (error) {
          if (error instanceof Error && error.message === "storage_unconfigured") {
            return NextResponse.json({ error: "Fillagringen är inte konfigurerad" }, { status: 503 });
          }
          throw error;
        }
      } else if (modern.data_url) {
        bytes = bytesFromDataUrl(modern.data_url, modern.content_type);
      }
    } else {
      const documentLog = await db.auditLog.findFirst({
        where: {
          id,
          company_id: user.company_id,
          entity_type: "document",
          action: "document.created",
        },
        select: { id: true, metadata: true },
      });
      if (!documentLog) return NextResponse.json({ error: "Dokumentet hittades inte" }, { status: 404 });

      const lifecycle = await getDocumentLifecycleState(user.company_id, documentLog.id);
      if (lifecycle.state !== "active") {
        return NextResponse.json({ error: "Dokumentet är inte längre publicerat" }, { status: 410 });
      }

      const metadata = (documentLog.metadata || {}) as DocumentMetadata;
      if (metadata.storage === "ManagedDocument") {
        return NextResponse.json({ error: "Dokumentet hittades inte" }, { status: 404 });
      }

      visibility = typeof metadata.visibility === "string" ? metadata.visibility : "internal";
      const scope = {
        propertyId: typeof metadata.propertyId === "string" ? metadata.propertyId : null,
        unitId: typeof metadata.unitId === "string" ? metadata.unitId : null,
        leaseId: typeof metadata.leaseId === "string" ? metadata.leaseId : null,
      };
      if (!residentDocumentVisibilities.has(visibility) || !documentAccessibleToLease(visibility, scope, lease)) {
        return NextResponse.json({ error: "Du saknar behörighet till dokumentet" }, { status: 403 });
      }

      documentId = documentLog.id;
      contentType = typeof metadata.contentType === "string" ? metadata.contentType : "";
      fileName = typeof metadata.fileName === "string"
        ? metadata.fileName
        : typeof metadata.name === "string"
          ? metadata.name
          : "dokument";
      expectedSize = typeof metadata.sizeBytes === "number" ? metadata.sizeBytes : null;

      const storageUrl = typeof metadata.storageUrl === "string" ? metadata.storageUrl : null;
      const dataUrl = typeof metadata.dataUrl === "string" ? metadata.dataUrl : null;
      if (storageUrl) {
        try {
          bytes = await bytesFromStorage(storageUrl);
        } catch (error) {
          if (error instanceof Error && error.message === "storage_unconfigured") {
            return NextResponse.json({ error: "Fillagringen är inte konfigurerad" }, { status: 503 });
          }
          throw error;
        }
      } else if (dataUrl) {
        bytes = bytesFromDataUrl(dataUrl, contentType);
      }
    }

    if (!allowedDocumentContentTypes.has(contentType)) {
      return NextResponse.json({ error: "Dokumentets filformat stöds inte" }, { status: 415 });
    }
    if (!bytes?.length) {
      return NextResponse.json({ error: "Dokumentfilen saknas" }, { status: 404 });
    }
    if (expectedSize !== null && bytes.length !== expectedSize) {
      return NextResponse.json({ error: "Dokumentfilens storlek kunde inte verifieras" }, { status: 422 });
    }

    const safeName = safeDocumentFileName(fileName);
    const validation = validateDocumentFile({
      bytes,
      contentType,
      fileName: safeName,
      maxBytes: 2_000_000,
    });
    if (!validation.ok) {
      return NextResponse.json({ error: "Dokumentfilens innehåll kunde inte verifieras" }, { status: 422 });
    }

    await db.auditLog.create({
      data: {
        company_id: user.company_id,
        actor_user_id: user.id,
        entity_type: "document",
        entity_id: documentId,
        action: "resident_portal.document_downloaded",
        metadata: {
          documentId,
          leaseId: lease.id,
          leaseNumber: lease.lease_number,
          visibility,
          fileName: validation.fileName,
          contentType,
          sizeBytes: bytes.length,
          accessMode: "operations_preview",
        },
      },
    });

    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(bytes.length),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(validation.fileName)}`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    console.error("Download resident document error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
