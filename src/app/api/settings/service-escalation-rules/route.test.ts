import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  getServiceEscalationRulesMock,
  upsertServiceEscalationRulesMock,
  auditLogCreateMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  getServiceEscalationRulesMock: vi.fn(),
  upsertServiceEscalationRulesMock: vi.fn(),
  auditLogCreateMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/service-escalation-rules", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/service-escalation-rules")>()),
  getServiceEscalationRules: getServiceEscalationRulesMock,
  upsertServiceEscalationRules: upsertServiceEscalationRulesMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    auditLog: { create: auditLogCreateMock },
  },
}));

import { GET, PUT } from "./route";

const rules = {
  enabled: true,
  escalateBlocked: true,
  escalateOverdue: true,
  graceDays: 0,
  repeatDays: 1,
  recipientRoles: ["owner"],
  includeAssignee: true,
};

const technician = {
  id: "user-tech",
  company_id: "company-a",
  role: "technician",
  email: "tech@exempel.se",
  status: "active",
};
const resident = {
  id: "user-resident",
  company_id: "company-a",
  role: "resident",
  email: "boende@exempel.se",
  status: "active",
};
const owner = {
  id: "user-owner",
  company_id: "company-a",
  role: "owner",
  email: "owner@exempel.se",
  status: "active",
};

function putRequest(body: Record<string, unknown>) {
  return new Request("https://www.revalta.se/api/settings/service-escalation-rules", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("settings service escalation rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServiceEscalationRulesMock.mockResolvedValue({
      rules,
      updatedAt: "2026-09-21T00:00:00.000Z",
    });
    upsertServiceEscalationRulesMock.mockResolvedValue("2026-09-21T12:00:00.000Z");
    auditLogCreateMock.mockResolvedValue({ id: "audit-1" });
  });

  it("rejects resident reads of organisation escalation rules", async () => {
    getCurrentUserMock.mockResolvedValue(resident);

    const response = await GET();

    expect(response.status).toBe(403);
    expect(getServiceEscalationRulesMock).not.toHaveBeenCalled();
  });

  it("lets technicians read rules for the session company without write rights", async () => {
    getCurrentUserMock.mockResolvedValue(technician);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.canManage).toBe(false);
    expect(getServiceEscalationRulesMock).toHaveBeenCalledWith("company-a");
  });

  it("rejects technician updates of organisation escalation rules", async () => {
    getCurrentUserMock.mockResolvedValue(technician);

    const response = await PUT(putRequest(rules));

    expect(response.status).toBe(403);
    expect(upsertServiceEscalationRulesMock).not.toHaveBeenCalled();
    expect(auditLogCreateMock).not.toHaveBeenCalled();
  });

  it("writes escalation rules only for the authenticated company", async () => {
    getCurrentUserMock.mockResolvedValue(owner);

    const response = await PUT(putRequest({
      ...rules,
      companyId: "company-b",
      graceDays: 2,
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.canManage).toBe(true);
    expect(upsertServiceEscalationRulesMock).toHaveBeenCalledWith(
      "company-a",
      "user-owner",
      expect.objectContaining({ graceDays: 2 }),
    );
    expect(auditLogCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        company_id: "company-a",
        entity_id: "company-a",
        action: "service_escalation_rules.updated",
      }),
    }));
  });
});
