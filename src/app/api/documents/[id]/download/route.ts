import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { getDocumentLifecycleState } from "@/lib/document-lifecycle";
import {
  documentDownloadHeaders,
  DocumentStorageError,
  loadStoredDocumentFile,
  type StoredDocumentMetadata,
} from "@/lib/document-storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const { id } = await params;
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
    if (lifecycle.state === "archived") {
      return NextResponse.json({ error: "Dokumentet är arkiverat" }, { status: 410 });
    }

    const file = await loadStoredDocumentFile((documentLog.metadata || {}) as StoredDocumentMetadata);
    await db.auditLog.create({
      data: {
        company_id: user.company_id,
        actor_user_id: user.id,
        entity_type: "document",
        entity_id: documentLog.id,
        action: "document.downloaded",
        metadata: {
          documentId: documentLog.id,
          fileName: file.fileName,
          contentType: file.contentType,
          sizeBytes: file.sizeBytes,
        },
      },
    });

    return new NextResponse(file.body, { status: 200, headers: documentDownloadHeaders(file) });
  } catch (error) {
    if (error instanceof DocumentStorageError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Download document error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
