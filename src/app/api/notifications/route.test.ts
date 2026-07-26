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

import { DELETE } from "./route";

describe("notifications route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notificationFindManyMock.mockResolvedValue([]);
    notificationReadFindManyMock.mockResolvedValue([]);
    auditFindManyMock.mockResolvedValue([]);
    notificationUpdateManyMock.mockResolvedValue({ count: 1 });
    writeAuditLogMock.mockResolvedValue(undefined);
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
