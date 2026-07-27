import { NextResponse } from "next/server";
import { canManageTickets, getCurrentUser, type CompanyUser } from "@/lib/current-user";
import {
  acquireWorkOrderEditLock,
  getWorkOrderEditLock,
  releaseWorkOrderEditLock,
  renewWorkOrderEditLock,
} from "@/lib/work-order-edit-lock";
import { findAccessibleWorkOrder, notFoundWorkOrder } from "@/lib/assigned-work-access";

function noStore(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: { "Cache-Control": "private, no-store", ...(init?.headers || {}) },
  });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return noStore({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return noStore({ error: "Användaren saknar organisation" }, { status: 400 });

  const { id } = await params;
  if (!await findAccessibleWorkOrder(user as CompanyUser, id)) return notFoundWorkOrder();
  const lock = await getWorkOrderEditLock(user.company_id, id);
  return noStore({ lock, ownedByCurrentUser: lock?.userId === user.id });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return noStore({ error: "Obehörig" }, { status: 401 });
  if (!canManageTickets(user.role)) return noStore({ error: "Du saknar behörighet att redigera arbetsordrar" }, { status: 403 });
  if (!user.company_id) return noStore({ error: "Användaren saknar organisation" }, { status: 400 });

  const { id } = await params;
  if (!await findAccessibleWorkOrder(user as CompanyUser, id)) return notFoundWorkOrder();
  const body = (await request.json().catch(() => null)) as { action?: unknown; token?: unknown; leaseSeconds?: unknown } | null;
  const action = typeof body?.action === "string" ? body.action.trim() : "acquire";

  if (action === "acquire") {
    const result = await acquireWorkOrderEditLock({
      companyId: user.company_id,
      workOrderId: id,
      userId: user.id,
      leaseSeconds: body?.leaseSeconds,
    });
    if (!result.ok && result.code === "not_found") return noStore({ error: "Arbetsordern hittades inte" }, { status: 404 });
    if (!result.ok) {
      return noStore(
        {
          error: `${result.holder.name || result.holder.email} redigerar redan arbetsordern.`,
          code: result.code,
          holder: result.holder,
          version: result.version,
        },
        { status: 423 },
      );
    }
    return noStore({ lock: result }, { status: 201 });
  }

  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!token) return noStore({ error: "Låstoken krävs" }, { status: 400 });

  if (action === "renew") {
    const result = await renewWorkOrderEditLock({
      companyId: user.company_id,
      workOrderId: id,
      userId: user.id,
      token,
      leaseSeconds: body?.leaseSeconds,
    });
    if (!result.ok) return noStore({ error: "Redigeringslåset har gått förlorat. Ladda om arbetsordern.", code: result.code }, { status: 409 });
    return noStore({ lock: result });
  }

  if (action === "release") {
    const result = await releaseWorkOrderEditLock({ companyId: user.company_id, workOrderId: id, userId: user.id, token });
    return noStore({ released: result.ok });
  }

  return noStore({ error: "Ogiltig låsåtgärd" }, { status: 400 });
}
