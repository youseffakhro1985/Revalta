import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUserMock, leaseFindFirstMock, linkFindManyMock } = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  leaseFindFirstMock: vi.fn(),
  linkFindManyMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    lease: { findFirst: leaseFindFirstMock },
    leaseInspectionWorkOrderLink: { findMany: linkFindManyMock },
  },
}));

import { GET } from "./route";

const params = Promise.resolve({ id: "lease-1" });

describe("GET /api/leases/[id]/inspection-items/work-orders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    leaseFindFirstMock.mockResolvedValue({ id: "lease-1" });
    linkFindManyMock.mockResolvedValue([]);
  });

  it("denies technicians before listing inspection work orders", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await GET(new Request("http://localhost/api/leases/lease-1/inspection-items/work-orders"), { params });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet att visa leasingdata");
    expect(leaseFindFirstMock).not.toHaveBeenCalled();
  });

  it("rejects residents before listing inspection work orders", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });
    const response = await GET(new Request("http://localhost/api/leases/lease-1/inspection-items/work-orders"), { params });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(leaseFindFirstMock).not.toHaveBeenCalled();
  });
});
