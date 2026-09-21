import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/service-escalation-rules", () => ({
  getServiceEscalationRules: vi.fn(),
}));

vi.mock("@/lib/service-escalation-engine", () => ({
  listServiceAssignmentEscalations: vi.fn(),
}));

vi.mock("@/lib/service-notification-assignments", () => ({
  listServiceNotificationAssignments: vi.fn(),
}));

vi.mock("@/lib/soft-delete-compat", () => ({
  sqlSoftDeleteGuard: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: {
    $queryRaw: vi.fn(),
    user: { findMany: vi.fn() },
  },
}));

import { GET } from "./route";

describe("settings service escalations staff scope", () => {
  beforeEach(() => {
    getCurrentUserMock.mockResolvedValue({
      id: "user-resident",
      company_id: "company-a",
      role: "resident",
      email: "boende@exempel.se",
      status: "active",
    });
  });

  it("rejects resident reads of company-wide escalation assignments and recipient emails", async () => {
    const response = await GET();
    expect(response.status).toBe(403);
  });
});
