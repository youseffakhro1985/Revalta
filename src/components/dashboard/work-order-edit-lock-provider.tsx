"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useWorkOrderEditLock } from "@/hooks/use-work-order-edit-lock";

type WorkOrderEditLockApi = ReturnType<typeof useWorkOrderEditLock>;

const WorkOrderEditLockContext = createContext<WorkOrderEditLockApi | null>(null);

export function WorkOrderEditLockProvider({
  workOrderId,
  enabled,
  children,
}: {
  workOrderId: string;
  enabled: boolean;
  children: ReactNode;
}) {
  const lock = useWorkOrderEditLock(workOrderId, enabled);
  return <WorkOrderEditLockContext.Provider value={lock}>{children}</WorkOrderEditLockContext.Provider>;
}

export function useSharedWorkOrderEditLock() {
  const lock = useContext(WorkOrderEditLockContext);
  if (!lock) {
    throw new Error("useSharedWorkOrderEditLock måste användas under WorkOrderEditLockProvider");
  }
  return lock;
}

export function useOptionalWorkOrderEditLock() {
  return useContext(WorkOrderEditLockContext);
}
