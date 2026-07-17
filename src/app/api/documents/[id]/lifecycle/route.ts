import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { getDocumentLifecycleState } from "@/lib/document-lifecycle";

const allowedTransitions = new Set(["archive", "unpublish", "restore"]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
    if (!["owner", "admin", "manager"].includes(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att ändra dokument" }, { status: 403 });
    }

    const { id } = await params;
    const body = (await request.json().catch(() => null)) as { transition?: unknown; reason?: unknown } | null;
    const transition = typeof body?.transition === "string" ? body.transition.trim() : "";
    const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 500) : "";
    if (!allowedTransitions.has(transition)) {
      return NextResponse.json({ error: "Ogiltig dokumentåtgärd" }, { status: 400 });
    }

    const document = await db.auditLog.findFirst({
      where: {
        id,
        company_id: user.company_id,
        entity_type: "document",
        action: "document.created",
      },
      select: { id: true, metadata: true },
    });
    if (!document) return NextResponse.json({ error: "Dokumentet hittades inte" }, { status: 404 });

    const current = await getDocumentLifecycleState(user.company_id, document.id);
    const nextState = transition === "archive" ? "archived" : transition === "unpublish" ? "unpublished" : "active";
    if (current.state === nextState) {
      return NextResponse.json({ success: true, state: current.state, unchanged: true });
    }
    if (transition === "unpublish" && current.state === "archived") {
      return NextResponse.json({ error: "Återställ det arkiverade dokumentet innan det avpubliceras" }, { status: 409 });
    }

    const action = transition === "archive"
      ? "document.archived"
      : transition === "unpublish"
        ? "document.unpublished"
        : "document.restored";

    const metadata = (document.metadata || {}) as Record<string, unknown>;
    await db.auditLog.create({
      data: {
        company_id: user.company_id,
        actor_user_id: user.id,
        entity_type: "document",
        entity_id: document.id,
        action,
        metadata: {
          documentId: document.id,
          previousState: current.state,
          nextState,
          reason: reason || null,
          documentName: typeof metadata.name === "string" ? metadata.name : "Dokument",
          previousVisibility: typeof metadata.visibility === "string" ? metadata.visibility : "internal",
        },
      },
    });

    return NextResponse.json({ success: true, state: nextState });
  } catch (error) {
    console.error("Update document lifecycle error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
