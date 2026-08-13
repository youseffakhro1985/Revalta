"use client";

import { useState } from "react";
import {
  WORK_ORDER_STATUS_LABELS,
  getAllowedWorkOrderTransitions,
  normalizeWorkOrderStatus,
  type WorkOrderStatus,
} from "@/lib/work-order-workflow";
import { readResponseJson } from "@/lib/fetch-json";
import { premiumFieldClass } from "@/components/dashboard/premium-ui";

export type QuickActionUser = { id: string; name: string | null; email: string };

type WorkOrderQuickActionsProps = {
  workOrderId: string;
  status: string;
  assignedToId: string | null;
  users: QuickActionUser[];
  canManage: boolean;
  canAssign: boolean;
  onUpdated: (patch: {
    status?: string;
    assigned_to?: QuickActionUser | null;
  }) => void;
  compact?: boolean;
};

export function WorkOrderQuickActions({
  workOrderId,
  status,
  assignedToId,
  users,
  canManage,
  canAssign,
  onUpdated,
  compact = false,
}: WorkOrderQuickActionsProps) {
  const [busy, setBusy] = useState<"status" | "assign" | null>(null);
  const [error, setError] = useState("");
  const currentStatus = normalizeWorkOrderStatus(status);
  const allowedStatuses = getAllowedWorkOrderTransitions(currentStatus);

  if (!canManage && !canAssign) return null;

  async function patch(body: Record<string, unknown>, mode: "status" | "assign") {
    setBusy(mode);
    setError("");
    try {
      const response = await fetch(`/api/work-orders/${workOrderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await readResponseJson<{
        error?: string;
        workOrder?: {
          status: string;
          assigned_to: QuickActionUser | null;
        };
      }>(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte uppdatera arbetsordern");
      onUpdated({
        status: data.workOrder?.status,
        assigned_to: data.workOrder?.assigned_to ?? null,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kunde inte uppdatera arbetsordern");
    } finally {
      setBusy(null);
    }
  }

  async function changeStatus(next: string) {
    if (!canManage || next === currentStatus) return;
    const normalized = normalizeWorkOrderStatus(next);
    let statusReason: string | undefined;
    if (normalized === "blocked" || normalized === "cancelled") {
      const reason = window.prompt(
        normalized === "blocked" ? "Ange orsak till blockering" : "Ange orsak till avbrott",
      );
      if (!reason || !reason.trim()) return;
      statusReason = reason.trim();
    }
    await patch({ status: normalized, ...(statusReason ? { statusReason } : {}) }, "status");
  }

  async function changeAssignee(nextId: string) {
    if (!canAssign) return;
    const assigned_to_id = nextId || null;
    if ((assignedToId || null) === assigned_to_id) return;
    await patch({ assignedToId: assigned_to_id }, "assign");
  }

  return (
    <div className={compact ? "mt-3 space-y-2" : "mt-3 space-y-2 border-t border-sand-100 pt-3"} onClick={(event) => event.preventDefault()}>
      {canManage ? (
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500">Status</span>
          <select
            className={`${premiumFieldClass} h-9 text-xs`}
            value={currentStatus}
            disabled={busy !== null}
            onChange={(event) => void changeStatus(event.target.value)}
            aria-label="Ändra status"
          >
            {allowedStatuses.map((value) => (
              <option key={value} value={value}>
                {WORK_ORDER_STATUS_LABELS[value as WorkOrderStatus] || value}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {canAssign ? (
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500">Ansvarig</span>
          <select
            className={`${premiumFieldClass} h-9 text-xs`}
            value={assignedToId || ""}
            disabled={busy !== null}
            onChange={(event) => void changeAssignee(event.target.value)}
            aria-label="Ändra ansvarig"
          >
            <option value="">Ej tilldelad</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name || user.email}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {busy ? <p className="text-[11px] text-ink-500">Sparar…</p> : null}
      {error ? <p className="text-[11px] font-medium text-red-700">{error}</p> : null}
    </div>
  );
}
