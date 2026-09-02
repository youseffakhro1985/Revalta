import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  calendarFindManyMock,
  calendarFindFirstMock,
  calendarCreateMock,
  calendarUpdateManyMock,
  calendarDeleteManyMock,
  auditFindManyMock,
  auditFindFirstMock,
  transactionMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  calendarFindManyMock: vi.fn(),
  calendarFindFirstMock: vi.fn(),
  calendarCreateMock: vi.fn(),
  calendarUpdateManyMock: vi.fn(),
  calendarDeleteManyMock: vi.fn(),
  auditFindManyMock: vi.fn(),
  auditFindFirstMock: vi.fn(),
  transactionMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/audit", () => ({
  writeAuditLog: writeAuditLogMock,
}));

const tx = {
  calendarEvent: {
    create: calendarCreateMock,
    updateMany: calendarUpdateManyMock,
    deleteMany: calendarDeleteManyMock,
  },
};

vi.mock("@/lib/db", () => ({
  default: {
    calendarEvent: {
      findMany: calendarFindManyMock,
      findFirst: calendarFindFirstMock,
      create: calendarCreateMock,
      updateMany: calendarUpdateManyMock,
      deleteMany: calendarDeleteManyMock,
    },
    auditLog: { findMany: auditFindManyMock, findFirst: auditFindFirstMock },
    $transaction: transactionMock,
  },
}));

import { DELETE, PATCH, POST } from "./route";

const user = { id: "user-1", company_id: "company-1", role: "owner" };
const existingEvent = {
  id: "event-1",
  title: "Rond",
  status: "planned",
  date: new Date("2026-07-28T00:00:00Z"),
  time: "09:00",
  type: "Rond",
  property_name: "Storgatan 1",
  responsible: "Anna",
  note: null,
};

describe("calendar route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calendarFindManyMock.mockResolvedValue([]);
    auditFindManyMock.mockResolvedValue([]);
    calendarCreateMock.mockResolvedValue({ id: "event-1" });
    calendarUpdateManyMock.mockResolvedValue({ count: 1 });
    calendarDeleteManyMock.mockResolvedValue({ count: 1 });
    writeAuditLogMock.mockResolvedValue(undefined);
    transactionMock.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
  });

  it("creates a calendar event and mandatory audit in the same transaction", async () => {
    getCurrentUserMock.mockResolvedValue(user);

    const response = await POST(new Request("http://localhost/api/calendar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "OVK",
        date: "2026-09-10",
        time: "10:30",
        type: "Besiktning",
        propertyName: "Storgatan 1",
        responsible: "Anna",
      }),
    }));

    expect(response.status).toBe(201);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(calendarCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ company_id: "company-1", title: "OVK", type: "Besiktning" }),
      select: { id: true },
    }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        entityType: "calendar_event",
        entityId: "event-1",
        action: "calendar.event",
        metadata: expect.objectContaining({ title: "OVK", storage: "CalendarEvent" }),
      }),
      tx,
    );
  });

  it("returns 500 when mandatory create audit fails inside the transaction", async () => {
    getCurrentUserMock.mockResolvedValue(user);
    writeAuditLogMock.mockRejectedValue(new Error("audit unavailable"));

    const response = await POST(new Request("http://localhost/api/calendar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "OVK", date: "2026-09-10" }),
    }));

    expect(response.status).toBe(500);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(calendarCreateMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).toHaveBeenCalledWith(expect.anything(), expect.anything(), tx);
  });

  it("updates modern calendar fields and writes field audit in the same transaction", async () => {
    getCurrentUserMock.mockResolvedValue(user);
    calendarFindFirstMock.mockResolvedValue(existingEvent);

    const response = await PATCH(new Request("http://localhost/api/calendar", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: "event-1", title: "Uppdaterad rond", responsible: "Bertil" }),
    }));

    expect(response.status).toBe(200);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(calendarUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "event-1", company_id: "company-1" },
      data: expect.objectContaining({ title: "Uppdaterad rond", responsible: "Bertil" }),
    }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      user,
      expect.objectContaining({ action: "calendar.event.updated" }),
      tx,
    );
  });

  it("returns 500 when mandatory update audit fails inside the transaction", async () => {
    getCurrentUserMock.mockResolvedValue(user);
    calendarFindFirstMock.mockResolvedValue(existingEvent);
    writeAuditLogMock.mockRejectedValue(new Error("audit unavailable"));

    const response = await PATCH(new Request("http://localhost/api/calendar", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: "event-1", responsible: "Bertil" }),
    }));

    expect(response.status).toBe(500);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(calendarUpdateManyMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).toHaveBeenCalledWith(expect.anything(), expect.anything(), tx);
  });

  it("fail-closes legacy calendar updates with Swedish 409", async () => {
    getCurrentUserMock.mockResolvedValue(user);
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
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("deletes modern calendar events and mandatory audit in the same transaction", async () => {
    getCurrentUserMock.mockResolvedValue(user);
    calendarFindFirstMock.mockResolvedValue({
      id: "event-1",
      title: "Möte",
      date: new Date("2026-07-28T00:00:00Z"),
      status: "planned",
    });

    const response = await DELETE(new Request("http://localhost/api/calendar", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: "event-1" }),
    }));

    expect(response.status).toBe(200);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(calendarDeleteManyMock).toHaveBeenCalledWith({
      where: { id: "event-1", company_id: "company-1" },
    });
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      user,
      expect.objectContaining({ action: "calendar.event.deleted" }),
      tx,
    );
  });

  it("returns 500 when mandatory delete audit fails inside the transaction", async () => {
    getCurrentUserMock.mockResolvedValue(user);
    calendarFindFirstMock.mockResolvedValue({
      id: "event-1",
      title: "Möte",
      date: new Date("2026-07-28T00:00:00Z"),
      status: "planned",
    });
    writeAuditLogMock.mockRejectedValue(new Error("audit unavailable"));

    const response = await DELETE(new Request("http://localhost/api/calendar", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: "event-1" }),
    }));

    expect(response.status).toBe(500);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(calendarDeleteManyMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).toHaveBeenCalledWith(expect.anything(), expect.anything(), tx);
  });

  it("rejects legacy rows on delete without opening a transaction", async () => {
    getCurrentUserMock.mockResolvedValue(user);
    calendarFindFirstMock.mockResolvedValue(null);
    auditFindFirstMock.mockResolvedValue({ id: "legacy-1" });

    const response = await DELETE(new Request("http://localhost/api/calendar", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: "legacy-1" }),
    }));

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/backfill/i);
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
