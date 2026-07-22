import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canViewOperations, getCurrentUser } from "@/lib/current-user";
import { getDocumentLifecycleState } from "@/lib/document-lifecycle";
import {
  documentDownloadHeaders,
  DocumentStorageError,
  loadStoredDocumentFile,
  type StoredDocumentMetadata,
} from "@/lib/document-storage";

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
  checksumSha256?: unknown;
  storageUrl?: unknown;
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

    const file = await loadStoredDocumentFile(metadata as StoredDocumentMetadata);

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
          fileName: file.fileName,
          contentType: file.contentType,
          sizeBytes: file.sizeBytes,
          accessMode: "operations_preview",
        },
      },
    });

    return new NextResponse(file.body, { status: 200, headers: documentDownloadHeaders(file) });
  } catch (error) {
    if (error instanceof DocumentStorageError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Download resident document error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
