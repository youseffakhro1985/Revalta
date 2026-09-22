import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUserMock, listRecurringIncidentEventsMock } = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  listRecurringIncidentEventsMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/recurring-incident-storage", () => ({
  listRecurringIncidentEvents: listRecurringIncidentEventsMock,
}));

import { GET } from "./route";

function reportRequest() {
  return new Request("http://localhost/api/work-orders/recurring/incidents/sla-report");
}

describe("GET /api/work-orders/recurring/incidents/sla-report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listRecurringIncidentEventsMock.mockResolvedValue([]);
  });

  it("denies technicians from reading the SLA report", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await GET(reportRequest());
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet att visa operativa rapporter");
    expect(listRecurringIncidentEventsMock).not.toHaveBeenCalled();
  });

  it("rejects residents before listing incident events", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });
    const response = await GET(reportRequest());
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(listRecurringIncidentEventsMock).not.toHaveBeenCalled();
  });

  it("returns an empty SLA report for managers without leaking other tenants", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "mgr-1", company_id: "company-1", role: "manager" });
    const response = await GET(reportRequest());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(listRecurringIncidentEventsMock).toHaveBeenCalledWith("company-1", expect.objectContaining({
      eventTypes: ["status", "assignment", "sla"],
    }));
    expect(body.rows).toEqual([]);
    expect(body.summary.incidents).toBe(0);
  });

  it("quotes formula-like CSV cells from Tenant B-shaped assignee names", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "mgr-1", company_id: "company-1", role: "manager" });
    const now = new Date();
    listRecurringIncidentEventsMock.mockResolvedValue([
      {
        notification_key: "=CMD(TenantB)",
        event_type: "sla",
        status: "open",
        created_at: now,
        payload: {
          notificationKey: "=CMD(TenantB)",
          slaChangedAt: now.toISOString(),
          responseDueAt: new Date(now.getTime() + 3600000).toISOString(),
        },
      },
      {
        notification_key: "=CMD(TenantB)",
        event_type: "assignment",
        status: "open",
        created_at: now,
        payload: {
          assignedTo: "user-tenant-b",
          assignedToName: "+Hyra",
        },
      },
    ]);

    const response = await GET(new Request("http://localhost/api/work-orders/recurring/incidents/sla-report?format=csv"));
    const csv = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(listRecurringIncidentEventsMock).toHaveBeenCalledWith("company-1", expect.any(Object));
    expect(csv).toContain("\"'=CMD(TenantB)\"");
    expect(csv).toContain("\"'+Hyra\"");
    expect(csv).not.toContain("\"=CMD(TenantB)\"");
  });
});
