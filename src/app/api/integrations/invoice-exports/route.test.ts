import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUserMock, exportJobFindManyMock, workOrderFindManyMock } = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  exportJobFindManyMock: vi.fn(),
  workOrderFindManyMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    workOrderInvoiceExportJob: { findMany: exportJobFindManyMock },
    workOrder: { findMany: workOrderFindManyMock },
  },
}));

import { GET } from "./route";

function exportRequest() {
  return new Request("http://localhost/api/integrations/invoice-exports");
}

describe("GET /api/integrations/invoice-exports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    exportJobFindManyMock.mockResolvedValue([]);
    workOrderFindManyMock.mockResolvedValue([]);
  });

  it("denies technicians from reading invoice export jobs", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await GET(exportRequest());
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet att visa fakturaexporter");
    expect(exportJobFindManyMock).not.toHaveBeenCalled();
    expect(workOrderFindManyMock).not.toHaveBeenCalled();
  });

  it("rejects residents before listing invoice export jobs", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });
    const response = await GET(exportRequest());
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(exportJobFindManyMock).not.toHaveBeenCalled();
    expect(workOrderFindManyMock).not.toHaveBeenCalled();
  });
});
