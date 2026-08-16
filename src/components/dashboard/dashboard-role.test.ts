import { describe, expect, it } from "vitest";
import { dashboardModeForRole } from "@/components/dashboard/dashboard-role";

describe("dashboard role mode", () => {
  it.each(["owner", "admin"])("routes %s to portfolio", (role) => {
    expect(dashboardModeForRole(role)).toBe("portfolio");
  });

  it("routes manager to management workspace", () => {
    expect(dashboardModeForRole("manager")).toBe("manager");
  });

  it("routes technician to min dag", () => {
    expect(dashboardModeForRole("technician")).toBe("technician");
  });

  it("keeps resident separate", () => {
    expect(dashboardModeForRole("resident")).toBe("resident");
  });

  it("uses read-only viewer mode for viewer and unknown roles", () => {
    expect(dashboardModeForRole("viewer")).toBe("viewer");
    expect(dashboardModeForRole("unknown")).toBe("viewer");
  });
});
