import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canViewOperations, getCurrentUser } from "@/lib/current-user";
import { getDocumentLifecycleState } from "@/lib/document-lifecycle";
import { allowedDocumentContentTypes, safeDocumentFileName, validateDocumentFile } from "@/lib/document-file-security";

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
};

function documentAccessibleToLease(
  visibility: string,
  metadata: DocumentMetadata,
  lease: { id: string; property_id: string; unit_id: string },
) {
  if (visibility === "resident_all") return true;
  if (visibility === "resident_property") return metadata.propertyId === lease.property_id;
  if (visibility === "resident_unit") return metadata.unitId === lease.unit_id;
  if (visibility === "resident_lease") return metadata.leaseId === lease.id;
  return false;
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

    const [lease, documentLog] = await Promise.all([
      db.lease.findFirst({
        where: {
          id: leaseId,
          company_id: user.company_id,
          status: { in: activeLeaseStatuses },
        },
        select: { id: true, property_id: true, unit_id: true, lease_number: true },
      }),
      db.auditLog.findFirst({
        where: {
          id,
          company_id: user.company_id,
          entity_type: "document",
          action: "document.created",
        },
        select: { id: true, metadata: true },
      }),
    ]);

    if (!lease || !documentLog) {
      return NextResponse.json({ error: "Dokumentet hittades inte" }, { status: 404 });
    }

    const lifecycle = await getDocumentLifecycleState(user.company_id, documentLog.id);
    if (lifecycle.state !== "active") {
      return NextResponse.json({ error: "Dokumentet är inte längre publicerat" }, { status: 410 });
    }

    const metadata = (documentLog.metadata || {}) as DocumentMetadata;
    const visibility = typeof metadata.visibility === "string" ? metadata.visibility : "internal";
    if (!residentDocumentVisibilities.has(visibility) || !documentAccessibleToLease(visibility, metadata, lease)) {
      return NextResponse.json({ error: "Du saknar behörighet till dokumentet" }, { status: 403 });
    }

    const contentType = typeof metadata.contentType === "string" ? metadata.contentType : "";
    const dataUrl = typeof metadata.dataUrl === "string" ? metadata.dataUrl : "";
    if (!allowedDocumentContentTypes.has(contentType)) {
      return NextResponse.json({ error: "Dokumentets filformat stöds inte" }, { status: 415 });
    }

    const prefix = `data:${contentType};base64,`;
    if (!dataUrl.startsWith(prefix)) {
      return NextResponse.json({ error: "Dokumentfilen är skadad eller saknas" }, { status: 422 });
    }

    const encoded = dataUrl.slice(prefix.length);
    const bytes = Buffer.from(encoded, "base64");
    const expectedSize = typeof metadata.sizeBytes === "number" ? metadata.sizeBytes : null;
    if (!bytes.length || (expectedSize !== null && bytes.length !== expectedSize)) {
      return NextResponse.json({ error: "Dokumentfilens storlek kunde inte verifieras" }, { status: 422 });
    }

    const fileName = safeDocumentFileName(
      typeof metadata.fileName === "string"
        ? metadata.fileName
        : typeof metadata.name === "string"
          ? metadata.name
          : "dokument",
    );
    const validation = validateDocumentFile({ bytes, contentType, fileName, maxBytes: 2_000_000 });
    if (!validation.ok) {
      return NextResponse.json({ error: "Dokumentfilens innehåll kunde inte verifieras" }, { status: 422 });
    }

    await db.auditLog.create({
      data: {
        company_id: user.company_id,
        actor_user_id: user.id,
        entity_type: "document",
        entity_id: documentLog.id,
        action: "resident_portal.document_downloaded",
        metadata: {
          documentId: documentLog.id,
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

    return new NextResponse(bytes, {
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
