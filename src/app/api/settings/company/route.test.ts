import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  companyFindUniqueMock,
  companyUpdateMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  companyFindUniqueMock: vi.fn(),
  companyUpdateMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    company: {
      findUnique: companyFindUniqueMock,
      update: companyUpdateMock,
    },
  },
}));

vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));
vi.mock("@/lib/structured-logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));

import { GET, PATCH } from "./route";

const owner = {
  id: "user-owner",
  company_id: "company-a",
  role: "owner",
  email: "owner@exempel.se",
  status: "active",
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
const companyRow = {
  id: "company-a",
  name: "Revalta Förvaltning",
  org_number: "556000-0000",
  plan: "professional",
  status: "active",
  created_at: new Date("2026-01-01"),
};

function patchRequest(body: Record<string, unknown>) {
  return new Request("https://www.revalta.se/api/settings/company", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("settings company route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    companyFindUniqueMock.mockResolvedValue(companyRow);
    companyUpdateMock.mockResolvedValue(companyRow);
    writeAuditLogMock.mockResolvedValue(undefined);
  });

  it("rejects resident reads of organisation settings", async () => {
    getCurrentUserMock.mockResolvedValue(resident);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(companyFindUniqueMock).not.toHaveBeenCalled();
  });

  it("lets staff read the session company without secrets", async () => {
    getCurrentUserMock.mockResolvedValue(technician);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.canManage).toBe(false);
    expect(body.company).toMatchObject({ id: "company-a", plan: "professional" });
    expect(body.company).not.toHaveProperty("stripe_customer_id");
    expect(companyFindUniqueMock).toHaveBeenCalledWith({
      where: { id: "company-a" },
      select: { id: true, name: true, org_number: true, plan: true, status: true, created_at: true },
    });
  });

  it("rejects technician writes to organisation settings", async () => {
    getCurrentUserMock.mockResolvedValue(technician);

    const response = await PATCH(patchRequest({ name: "Hijack", id: "company-b" }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Du saknar behörighet att ändra organisationen");
    expect(companyUpdateMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("rejects resident writes with the unified staff copy", async () => {
    getCurrentUserMock.mockResolvedValue(resident);

    const response = await PATCH(patchRequest({ name: "Hijack" }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(companyUpdateMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("updates only the authenticated company even if another company id is supplied", async () => {
    getCurrentUserMock.mockResolvedValue(owner);

    const response = await PATCH(patchRequest({
      id: "company-b",
      name: "Nytt namn",
      orgNumber: "556111-1111",
      plan: "enterprise",
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(companyUpdateMock).toHaveBeenCalledWith({
      where: { id: "company-a" },
      data: { name: "Nytt namn", org_number: "556111-1111" },
      select: { id: true, name: true, org_number: true, plan: true, status: true, created_at: true },
    });
    expect(writeAuditLogMock).toHaveBeenCalledWith(owner, expect.objectContaining({
      action: "settings.company_updated",
      entityId: "company-a",
    }));
  });
});
