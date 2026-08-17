import { describe, expect, it } from "vitest";
import { legacyDashboardRedirects, legacyWorkOrderDetailRedirect } from "@/lib/dashboard-route-compat";

describe("legacy dashboard route compatibility", () => {
  it("maps the legacy plural work-order index to the canonical singular route", () => {
    expect(legacyDashboardRedirects.workOrders).toBe("/dashboard/arbetsorder");
  });

  it("maps the legacy operations overview to the canonical singular route", () => {
    expect(legacyDashboardRedirects.workOrderOperations).toBe("/dashboard/arbetsorder/operationsoversikt");
  });

  it("preserves the work-order id while safely building the canonical detail target", () => {
    expect(legacyWorkOrderDetailRedirect("AO-2026-0142")).toBe("/dashboard/arbetsorder/AO-2026-0142");
    expect(legacyWorkOrderDetailRedirect("id with spaces")).toBe("/dashboard/arbetsorder/id%20with%20spaces");
  });
});
