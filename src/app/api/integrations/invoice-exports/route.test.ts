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

import { GET, POST } from "./route";

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

describe("POST /api/integrations/invoice-exports staff-scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    exportJobFindManyMock.mockResolvedValue([]);
    workOrderFindManyMock.mockResolvedValue([]);
  });

  it("rejects residents before listing export jobs", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });

    const response = await POST(new Request("http://localhost/api/integrations/invoice-exports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "retry", jobId: "job-1" }),
    }));

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(exportJobFindManyMock).not.toHaveBeenCalled();
  });

  it("denies technicians with the finance copy", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });

    const response = await POST(new Request("http://localhost/api/integrations/invoice-exports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "retry", jobId: "job-1" }),
    }));

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet");
    expect(exportJobFindManyMock).not.toHaveBeenCalled();
  });

  it("returns tenant-safe 404 when Tenant A retries a Tenant B export job id", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "owner-1", company_id: "company-1", role: "owner" });

    const response = await POST(new Request("http://localhost/api/integrations/invoice-exports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "retry", jobId: "job-tenant-b" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Exportjobbet hittades inte");
    expect(exportJobFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { company_id: "company-1" },
    }));
  });
});
