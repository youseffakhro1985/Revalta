import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  calendarFindManyMock,
  calendarFindFirstMock,
  calendarUpdateManyMock,
  calendarDeleteManyMock,
  auditFindManyMock,
  auditFindFirstMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  calendarFindManyMock: vi.fn(),
  calendarFindFirstMock: vi.fn(),
  calendarUpdateManyMock: vi.fn(),
  calendarDeleteManyMock: vi.fn(),
  auditFindManyMock: vi.fn(),
  auditFindFirstMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/audit", () => ({
  writeAuditLog: writeAuditLogMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    calendarEvent: {
      findMany: calendarFindManyMock,
      findFirst: calendarFindFirstMock,
      updateMany: calendarUpdateManyMock,
      deleteMany: calendarDeleteManyMock,
      create: vi.fn(),
    },
    auditLog: { findMany: auditFindManyMock, findFirst: auditFindFirstMock },
  },
}));

import { DELETE, PATCH } from "./route";

describe("calendar route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calendarFindManyMock.mockResolvedValue([]);
    auditFindManyMock.mockResolvedValue([]);
    calendarUpdateManyMock.mockResolvedValue({ count: 1 });
    calendarDeleteManyMock.mockResolvedValue({ count: 1 });
    writeAuditLogMock.mockResolvedValue(undefined);
  });

  it("updates modern calendar fields and writes field audit", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    calendarFindFirstMock.mockResolvedValue({
      id: "event-1",
      title: "Rond",
      status: "planned",
      date: new Date("2026-07-28T00:00:00Z"),
      time: "09:00",
      type: "Rond",
      property_name: "Storgatan 1",
      responsible: "Anna",
      note: null,
    });

    const response = await PATCH(new Request("http://localhost/api/calendar", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: "event-1", title: "Uppdaterad rond", responsible: "Bertil" }),
    }));

    expect(response.status).toBe(200);
    expect(calendarUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "event-1", company_id: "company-1" },
      data: expect.objectContaining({ title: "Uppdaterad rond", responsible: "Bertil" }),
    }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: "calendar.event.updated",
    }));
  });

  it("fail-closes legacy calendar updates with Swedish 409", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    calendarFindFirstMock.mockResolvedValue(null);
    auditFindFirstMock.mockResolvedValue({ id: "legacy-1" });

    const response = await PATCH(new Request("http://localhost/api/calendar", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: "legacy-1", status: "done" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toMatch(/backfill/i);
  });

  it("hard-deletes modern calendar events and rejects legacy rows", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    calendarFindFirstMock.mockResolvedValue({
      id: "event-1",
      title: "Möte",
      date: new Date("2026-07-28T00:00:00Z"),
      status: "planned",
    });

    const ok = await DELETE(new Request("http://localhost/api/calendar", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: "event-1" }),
    }));
    expect(ok.status).toBe(200);
    expect(calendarDeleteManyMock).toHaveBeenCalledWith({
      where: { id: "event-1", company_id: "company-1" },
    });
    expect(writeAuditLogMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: "calendar.event.deleted",
    }));

    calendarFindFirstMock.mockResolvedValue(null);
    auditFindFirstMock.mockResolvedValue({ id: "legacy-1" });
    const legacy = await DELETE(new Request("http://localhost/api/calendar", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: "legacy-1" }),
    }));
    expect(legacy.status).toBe(409);
    expect((await legacy.json()).error).toMatch(/backfill/i);
  });
});
