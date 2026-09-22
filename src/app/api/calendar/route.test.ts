import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  calendarFindManyMock,
  calendarFindFirstMock,
  calendarCreateMock,
  calendarUpdateManyMock,
  calendarDeleteManyMock,
  workOrderFindManyMock,
  roundFindManyMock,
  inspectionFindManyMock,
  maintenanceFindManyMock,
  leaseFindManyMock,
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
  workOrderFindManyMock: vi.fn(),
  roundFindManyMock: vi.fn(),
  inspectionFindManyMock: vi.fn(),
  maintenanceFindManyMock: vi.fn(),
  leaseFindManyMock: vi.fn(),
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
    workOrder: { findMany: workOrderFindManyMock },
    inspectionRound: { findMany: roundFindManyMock },
    complianceInspection: { findMany: inspectionFindManyMock },
    portfolioMaintenanceItem: { findMany: maintenanceFindManyMock },
    lease: { findMany: leaseFindManyMock },
    auditLog: { findMany: auditFindManyMock, findFirst: auditFindFirstMock },
    $transaction: transactionMock,
  },
}));

import { DELETE, GET, PATCH, POST } from "./route";

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
    workOrderFindManyMock.mockResolvedValue([]);
    roundFindManyMock.mockResolvedValue([]);
    inspectionFindManyMock.mockResolvedValue([]);
    maintenanceFindManyMock.mockResolvedValue([]);
    leaseFindManyMock.mockResolvedValue([]);
    auditFindManyMock.mockResolvedValue([]);
    calendarCreateMock.mockResolvedValue({ id: "event-1" });
    calendarUpdateManyMock.mockResolvedValue({ count: 1 });
    calendarDeleteManyMock.mockResolvedValue({ count: 1 });
    writeAuditLogMock.mockResolvedValue(undefined);
    transactionMock.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
  });

  it("rejects residents before loading work orders, leases or calendar events", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      company_id: "company-1",
      role: "resident",
      email: "boende@exempel.se",
    });

    const response = await GET();
    expect(response.status).toBe(403);
    expect(calendarFindManyMock).not.toHaveBeenCalled();
    expect(workOrderFindManyMock).not.toHaveBeenCalled();
    expect(leaseFindManyMock).not.toHaveBeenCalled();
    expect(auditFindManyMock).not.toHaveBeenCalled();
  });

  it("projects scheduled work orders from canonical WorkOrder storage", async () => {
    getCurrentUserMock.mockResolvedValue(user);
    workOrderFindManyMock.mockResolvedValue([{
      id: "wo-1",
      title: "Byt cirkulationspump",
      status: "in_progress",
      scheduled_start: new Date("2026-09-10T08:30:00Z"),
      work_order_number: "AO-1042",
      created_at: new Date("2026-09-01T10:00:00Z"),
      property: { name: "Storgatan 1" },
      assigned_to: { name: "Anna Tekniker", email: "anna@example.com" },
    }]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(workOrderFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        company_id: "company-1",
        deleted_at: null,
        scheduled_start: { not: null },
      }),
    }));
    expect(body.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "work-order:wo-1",
        entity_id: "wo-1",
        work_order_id: "wo-1",
        title: "Byt cirkulationspump",
        date: "2026-09-10",
        time: "10:30",
        type: "Arbetsorder",
        property_name: "Storgatan 1",
        responsible: "Anna Tekniker",
        status: "planned",
        source: "work_order",
        href: "/dashboard/arbetsorder/wo-1",
      }),
    ]));
  });

  it("projects ronder, besiktningar and underhåll from operational registers", async () => {
    getCurrentUserMock.mockResolvedValue(user);
    roundFindManyMock.mockResolvedValue([{
      id: "round-1",
      title: "Månadsrond",
      status: "planned",
      next_due: new Date("2026-09-12T07:00:00Z"),
      interval: "monthly",
      created_at: new Date("2026-09-01T10:00:00Z"),
      property: { name: "Storgatan 1" },
    }]);
    inspectionFindManyMock.mockResolvedValue([{
      id: "insp-1",
      title: "OVK",
      type: "ovk",
      status: "action_required",
      due_date: new Date("2026-09-20T00:00:00Z"),
      responsible: "Anna",
      created_at: new Date("2026-09-01T10:00:00Z"),
      property: { name: "Storgatan 1" },
    }]);
    maintenanceFindManyMock.mockResolvedValue([{
      id: "maint-1",
      component: "Tak",
      measure: "Omläggning",
      planned_year: 2027,
      status: "planned",
      created_at: new Date("2026-09-01T10:00:00Z"),
      property: { name: "Storgatan 1" },
    }]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "round:round-1",
        type: "Rond",
        source: "round",
        href: "/dashboard/ronder",
        title: "Månadsrond",
      }),
      expect.objectContaining({
        id: "inspection:insp-1",
        type: "Besiktning",
        source: "inspection",
        href: "/dashboard/besiktningar",
        responsible: "Anna",
      }),
      expect.objectContaining({
        id: "maintenance:maint-1",
        type: "Underhåll",
        source: "maintenance",
        date: "2027-01-01",
        href: "/dashboard/underhall",
      }),
    ]));
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

  it("rejects manual work-order calendar events", async () => {
    getCurrentUserMock.mockResolvedValue(user);

    const response = await POST(new Request("http://localhost/api/calendar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Duplicerad AO", date: "2026-09-10", type: "Arbetsorder" }),
    }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/arbetsorder/i);
    expect(transactionMock).not.toHaveBeenCalled();
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

  it("rejects projected work-order updates without opening a transaction", async () => {
    getCurrentUserMock.mockResolvedValue(user);

    const response = await PATCH(new Request("http://localhost/api/calendar", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: "work-order:wo-1", status: "done" }),
    }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/arbetsorder/i);
    expect(transactionMock).not.toHaveBeenCalled();
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

  it("rejects projected work-order deletes without opening a transaction", async () => {
    getCurrentUserMock.mockResolvedValue(user);

    const response = await DELETE(new Request("http://localhost/api/calendar", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: "work-order:wo-1" }),
    }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/arbetsorder/i);
    expect(transactionMock).not.toHaveBeenCalled();
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

  it("POST/PATCH/DELETE reject residents before looking up calendar events", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      company_id: "company-1",
      role: "resident",
      email: "boende@exempel.se",
    });

    const post = await POST(new Request("http://localhost/api/calendar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "OVK", date: "2026-09-10" }),
    }));
    expect(post.status).toBe(403);
    expect((await post.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");

    const patch = await PATCH(new Request("http://localhost/api/calendar", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: "event-1", status: "done" }),
    }));
    expect(patch.status).toBe(403);
    expect((await patch.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");

    const del = await DELETE(new Request("http://localhost/api/calendar", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: "event-1" }),
    }));
    expect(del.status).toBe(403);
    expect((await del.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");

    expect(calendarFindFirstMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("POST/PATCH/DELETE deny viewers with the manage copy", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "viewer-1", company_id: "company-1", role: "viewer" });

    const post = await POST(new Request("http://localhost/api/calendar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "OVK", date: "2026-09-10" }),
    }));
    expect(post.status).toBe(403);
    expect((await post.json()).error).toBe("Du saknar behörighet");

    const patch = await PATCH(new Request("http://localhost/api/calendar", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: "event-1", status: "done" }),
    }));
    expect(patch.status).toBe(403);
    expect((await patch.json()).error).toBe("Du saknar behörighet");

    const del = await DELETE(new Request("http://localhost/api/calendar", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: "event-1" }),
    }));
    expect(del.status).toBe(403);
    expect((await del.json()).error).toBe("Du saknar behörighet");

    expect(calendarFindFirstMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("GET scopes lease projections to the caller company", async () => {
    getCurrentUserMock.mockResolvedValue(user);

    const response = await GET();
    expect(response.status).toBe(200);
    expect(leaseFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        company_id: "company-1",
        deleted_at: null,
        property: { deleted_at: null },
      }),
    }));
  });

  it("GET scopes work-order projections to the caller company and never queries Tenant B", async () => {
    getCurrentUserMock.mockResolvedValue(user);

    const response = await GET();
    expect(response.status).toBe(200);
    expect(workOrderFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        company_id: "company-1",
        deleted_at: null,
        scheduled_start: { not: null },
        property: { deleted_at: null },
      },
    }));
  });

  it("returns tenant-safe 404 when Tenant A patches a Tenant B calendar event id", async () => {
    getCurrentUserMock.mockResolvedValue(user);
    calendarFindFirstMock.mockResolvedValue(null);
    auditFindFirstMock.mockResolvedValue(null);

    const response = await PATCH(new Request("http://localhost/api/calendar", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: "event-tenant-b", status: "done" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Aktiviteten hittades inte");
    expect(calendarFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "event-tenant-b", company_id: "company-1" },
    }));
    expect(transactionMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("returns tenant-safe 404 when Tenant A deletes a Tenant B calendar event id", async () => {
    getCurrentUserMock.mockResolvedValue(user);
    calendarFindFirstMock.mockResolvedValue(null);
    auditFindFirstMock.mockResolvedValue(null);

    const response = await DELETE(new Request("http://localhost/api/calendar", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: "event-tenant-b" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Aktiviteten hittades inte");
    expect(calendarFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "event-tenant-b", company_id: "company-1" },
    }));
    expect(transactionMock).not.toHaveBeenCalled();
    expect(calendarDeleteManyMock).not.toHaveBeenCalled();
  });
});
