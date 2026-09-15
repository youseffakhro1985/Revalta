import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("work order edit lock provider", () => {
  it("shares one edit lock between the work-order page and the SLA panel", () => {
    const provider = readFileSync(new URL("./work-order-edit-lock-provider.tsx", import.meta.url), "utf8");
    const layout = readFileSync(new URL("../../app/(dashboard)/dashboard/arbetsorder/[id]/layout.tsx", import.meta.url), "utf8");
    const page = readFileSync(new URL("../../app/(dashboard)/dashboard/arbetsorder/[id]/page.tsx", import.meta.url), "utf8");

    expect(provider).toContain("WorkOrderEditLockProvider");
    expect(provider).toContain("useWorkOrderEditLock");
    expect(layout).toContain("WorkOrderEditLockProvider");
    expect(layout).toContain("canManageTickets(user.role)");
    expect(page).toContain("useSharedWorkOrderEditLock");
    expect(page).not.toContain("useWorkOrderEditLock(");
  });
});
