import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  notificationFindManyMock,
  notificationFindFirstMock,
  notificationUpdateManyMock,
  notificationReadFindManyMock,
  notificationReadUpsertMock,
  auditFindManyMock,
  auditFindFirstMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  notificationFindManyMock: vi.fn(),
  notificationFindFirstMock: vi.fn(),
  notificationUpdateManyMock: vi.fn(),
  notificationReadFindManyMock: vi.fn(),
  notificationReadUpsertMock: vi.fn(),
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
    appNotification: {
      findMany: notificationFindManyMock,
      findFirst: notificationFindFirstMock,
      updateMany: notificationUpdateManyMock,
      create: vi.fn(),
    },
    notificationRead: {
      findMany: notificationReadFindManyMock,
      upsert: notificationReadUpsertMock,
    },
    auditLog: { findMany: auditFindManyMock, findFirst: auditFindFirstMock },
  },
}));

import { DELETE, GET, PATCH, POST } from "./route";

describe("notifications route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notificationFindManyMock.mockResolvedValue([]);
    notificationReadFindManyMock.mockResolvedValue([]);
    auditFindManyMock.mockResolvedValue([]);
    notificationUpdateManyMock.mockResolvedValue({ count: 1 });
    writeAuditLogMock.mockResolvedValue(undefined);
  });

  it("rejects resident GET and PATCH before loading company notifications", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      company_id: "company-1",
      role: "resident",
      email: "boende@exempel.se",
    });

    const getResponse = await GET();
    const patchResponse = await PATCH(new Request("http://localhost/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationId: "notif-1" }),
    }));

    expect(getResponse.status).toBe(403);
    expect(patchResponse.status).toBe(403);
    expect(notificationFindManyMock).not.toHaveBeenCalled();
    expect(notificationFindFirstMock).not.toHaveBeenCalled();
    expect(auditFindManyMock).not.toHaveBeenCalled();
  });

  it("lets technicians list company notifications without audit events", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "tech-1",
      company_id: "company-1",
      role: "technician",
    });

    const response = await GET();
    expect(response.status).toBe(200);
    expect(notificationFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { company_id: "company-1", deleted_at: null },
    }));
  });

  it("soft-deletes modern notifications and writes delete audit", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    notificationFindFirstMock.mockResolvedValue({
      id: "notif-1",
      title: "Driftstörning",
    });

    const response = await DELETE(new Request("http://localhost/api/notifications", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationId: "notif-1" }),
    }));

    expect(response.status).toBe(200);
    expect(notificationFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "notif-1", company_id: "company-1", deleted_at: null },
    }));
    expect(notificationUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "notif-1", company_id: "company-1", deleted_at: null },
      data: expect.objectContaining({
        deleted_at: expect.any(Date),
      }),
    }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: "notification.deleted",
      metadata: expect.objectContaining({ softDelete: true, storage: "AppNotification" }),
    }));
  });

  it("fail-closes legacy notification deletes with Swedish 409", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    notificationFindFirstMock.mockResolvedValue(null);
    auditFindFirstMock.mockResolvedValue({
      id: "legacy-1",
      metadata: { title: "Legacy notis", message: "Äldre lagring" },
    });

    const response = await DELETE(new Request("http://localhost/api/notifications", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationId: "legacy-1" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toMatch(/backfill/i);
    expect(notificationUpdateManyMock).not.toHaveBeenCalled();
  });
});

describe("notifications writes staff-scope", () => {
  beforeEach(() => vi.clearAllMocks());

  it("POST rejects residents before creating a notification", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      company_id: "company-1",
      role: "resident",
      email: "boende@exempel.se",
    });

    const response = await POST(new Request("http://localhost/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Drift", message: "Meddelande" }),
    }));

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
  });

  it("POST denies technicians with the operations copy", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });

    const response = await POST(new Request("http://localhost/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Drift", message: "Meddelande" }),
    }));

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet");
  });

  it("DELETE rejects residents before looking up a notification", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      company_id: "company-1",
      role: "resident",
      email: "boende@exempel.se",
    });

    const response = await DELETE(new Request("http://localhost/api/notifications", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationId: "notif-1" }),
    }));

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(notificationFindFirstMock).not.toHaveBeenCalled();
  });

  it("DELETE denies technicians with the operations copy", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });

    const response = await DELETE(new Request("http://localhost/api/notifications", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationId: "notif-1" }),
    }));

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet");
    expect(notificationFindFirstMock).not.toHaveBeenCalled();
  });
});

describe("notifications Tenant B related ids", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notificationFindFirstMock.mockResolvedValue(null);
    auditFindFirstMock.mockResolvedValue(null);
    notificationReadUpsertMock.mockResolvedValue({ id: "read-1" });
    notificationUpdateManyMock.mockResolvedValue({ count: 1 });
    writeAuditLogMock.mockResolvedValue(undefined);
  });

  it("returns tenant-safe 404 when Tenant A marks a Tenant B notification as read", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "owner-1",
      company_id: "company-1",
      role: "owner",
    });

    const response = await PATCH(new Request("http://localhost/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationId: "notif-tenant-b" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Notisen hittades inte");
    expect(notificationFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "notif-tenant-b", company_id: "company-1" },
    }));
    expect(auditFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        company_id: "company-1",
        entity_id: "notif-tenant-b",
      }),
    }));
    expect(notificationReadUpsertMock).not.toHaveBeenCalled();
  });

  it("returns tenant-safe 404 when Tenant A deletes a Tenant B notification id", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "owner-1",
      company_id: "company-1",
      role: "owner",
    });

    const response = await DELETE(new Request("http://localhost/api/notifications", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationId: "notif-tenant-b" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Notisen hittades inte");
    expect(notificationFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "notif-tenant-b", company_id: "company-1", deleted_at: null },
    }));
    expect(notificationUpdateManyMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });
});
