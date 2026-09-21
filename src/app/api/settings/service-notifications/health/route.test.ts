import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUserMock, digestFindManyMock, integrationFindManyMock } = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  digestFindManyMock: vi.fn(),
  integrationFindManyMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    componentServiceDigestRun: { findMany: digestFindManyMock },
    integrationEvent: { findMany: integrationFindManyMock },
  },
}));

import { GET } from "./route";

describe("GET /api/settings/service-notifications/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    digestFindManyMock.mockResolvedValue([]);
    integrationFindManyMock.mockResolvedValue([]);
  });

  it("denies technicians from reading delivery health", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await GET();
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Endast ägare och administratörer kan visa leveranshälsan");
    expect(digestFindManyMock).not.toHaveBeenCalled();
  });

  it("rejects residents before listing digest runs", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });
    const response = await GET();
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(digestFindManyMock).not.toHaveBeenCalled();
    expect(integrationFindManyMock).not.toHaveBeenCalled();
  });
});
