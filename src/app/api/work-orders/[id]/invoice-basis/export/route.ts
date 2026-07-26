import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { getLatestInvoiceDraft } from "@/lib/work-order-ops-storage";

type Obj = Record<string, unknown>;
function asObject(v: unknown): Obj | null {
  return v && typeof v === "object" && !Array.isArray(v) ? v as Obj : null;
}
function csvCell(v: unknown) {
  const s = String(v ?? "");
  return `"${s.replaceAll('"', '""')}"`;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  const { id } = await params;
  const order = await db.workOrder.findFirst({
    where: { deleted_at: null, id, company_id: user.company_id, property: { deleted_at: null } },
    select: {
      id: true,
      title: true,
      property: { select: { name: true, address: true, postal_code: true, city: true } },
      company: { select: { name: true, org_number: true } },
    },
  });
  if (!order) return NextResponse.json({ error: "Arbetsordern hittades inte" }, { status: 404 });

  const draft = await getLatestInvoiceDraft(user.company_id, id);
  if (!draft) return NextResponse.json({ error: "Faktureringsunderlag saknas" }, { status: 404 });

  const url = new URL(request.url);
  const format = (url.searchParams.get("format") || "json").toLowerCase();
  const lines = Array.isArray(draft.lines) ? draft.lines.map(asObject).filter(Boolean) as Obj[] : [];
  const exportId = crypto.randomUUID();
  await writeAuditLog(user, {
    entityType: "work_order",
    entityId: id,
    action: `work_order.invoice_export_${format}`,
    metadata: { exportId, versionId: draft.versionId ?? null, lineCount: lines.length, total: draft.total ?? 0, storage: "WorkOrderInvoiceDraft" },
  });

  if (format === "csv") {
    const header = ["Typ", "Beskrivning", "Antal", "Enhet", "Styckpris", "Belopp"].map(csvCell).join(";");
    const rows = lines.map((line) => [line.type, line.description, line.quantity, line.unit, line.unitPrice, line.total].map(csvCell).join(";"));
    const summary = ["", "", "", "", "Netto", draft.net ?? 0].map(csvCell).join(";")
      + "\n" + ["", "", "", "", "Moms", draft.vat ?? 0].map(csvCell).join(";")
      + "\n" + ["", "", "", "", "Totalt", draft.total ?? 0].map(csvCell).join(";");
    const body = "\uFEFF" + [header, ...rows, summary].join("\n");
    return new Response(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="revalta-fakturaunderlag-${id}.csv"`,
      },
    });
  }

  const integration = {
    schemaVersion: "1.0",
    source: "Revalta",
    exportId,
    exportedAt: new Date().toISOString(),
    providerHint: format === "fortnox" ? "fortnox" : format === "visma" ? "visma" : "generic",
    workOrder: { id: order.id, title: order.title, property: order.property },
    seller: order.company,
    invoice: { ...draft, lines },
  };
  return NextResponse.json(integration, {
    headers: { "Content-Disposition": `attachment; filename="revalta-fakturaunderlag-${id}-${format}.json"` },
  });
}
