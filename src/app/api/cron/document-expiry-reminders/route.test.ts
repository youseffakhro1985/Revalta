import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createLoggerMock,
  managedDocumentFindManyMock,
  appNotificationFindFirstMock,
  appNotificationCreateMock,
  auditLogCreateMock,
  transactionMock,
  loggerInfoMock,
  loggerWarnMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  createLoggerMock: vi.fn(),
  managedDocumentFindManyMock: vi.fn(),
  appNotificationFindFirstMock: vi.fn(),
  appNotificationCreateMock: vi.fn(),
  auditLogCreateMock: vi.fn(),
  transactionMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: {
    managedDocument: { findMany: managedDocumentFindManyMock },
    $transaction: transactionMock,
  },
}));

vi.mock("@prisma/client", () => ({
  Prisma: { sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }) },
}));
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

import { GET } from "./route";

const requestId = "550e8400-e29b-41d4-a716-446655440000";
function cronRequest() {
  return new Request("https://www.revalta.se/api/cron/document-expiry-reminders", {
    headers: { authorization: "Bearer test-cron-secret", "x-request-id": requestId },
  });
}

const dueSoon = {
  id: "document-1",
  company_id: "company-1",
  name: "Brandskyddskontroll",
  category: "besiktning",
  valid_until: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
  created_by_id: "user-1",
};

function txWith(overrides: { locked?: boolean; existing?: unknown }) {
  return {
    $queryRaw: vi.fn().mockResolvedValue([{ locked: overrides.locked ?? true }]),
    appNotification: {
      findFirst: appNotificationFindFirstMock.mockResolvedValue(overrides.existing ?? null),
      create: appNotificationCreateMock.mockResolvedValue({}),
    },
    auditLog: { create: auditLogCreateMock.mockResolvedValue({}) },
  };
}

describe("cron/document-expiry-reminders route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    createLoggerMock.mockReturnValue({
      debug: vi.fn(),
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
  });

  it("returns a correlated private 401 without logging CRON_SECRET", async () => {
    const response = await GET(new Request("https://www.revalta.se/api/cron/document-expiry-reminders", {
      headers: { "x-request-id": requestId },
    }));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: "Obehörig", errorCode: "UNAUTHORIZED", requestId });
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(managedDocumentFindManyMock).not.toHaveBeenCalled();
    expect(JSON.stringify(loggerWarnMock.mock.calls)).not.toContain("test-cron-secret");
  });

  it("creates a reminder and audit log for a document that hasn't been notified yet", async () => {
    managedDocumentFindManyMock.mockResolvedValue([dueSoon]);
    const tx = txWith({ locked: true, existing: null });
    transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(tx));

    const response = await GET(cronRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body).toEqual({ ok: true, scanned: 1, created: 1, skipped: 0 });
    expect(appNotificationCreateMock).toHaveBeenCalledTimes(1);
    expect(auditLogCreateMock).toHaveBeenCalledTimes(1);
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "document expiry cron completed",
      expect.objectContaining({ event: "cron.completed", job: "document_expiry_reminders", scanned: 1, created: 1, skipped: 0 }),
    );
    const logs = JSON.stringify([loggerInfoMock.mock.calls, loggerWarnMock.mock.calls]);
    expect(logs).not.toContain("Brandskyddskontroll");
    expect(logs).not.toContain("besiktning");
  });

  it("skips without creating a duplicate when a reminder already exists", async () => {
    managedDocumentFindManyMock.mockResolvedValue([dueSoon]);
    const tx = txWith({ locked: true, existing: { id: "notification-existing" } });
    transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(tx));

    const response = await GET(cronRequest());
    const body = await response.json();

    expect(body).toEqual({ ok: true, scanned: 1, created: 0, skipped: 1 });
    expect(appNotificationCreateMock).not.toHaveBeenCalled();
  });

  it("skips instead of double-sending when a concurrent invocation holds the lock", async () => {
    managedDocumentFindManyMock.mockResolvedValue([dueSoon]);
    const tx = txWith({ locked: false });
    transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(tx));

    const response = await GET(cronRequest());
    const body = await response.json();

    expect(body).toEqual({ ok: true, scanned: 1, created: 0, skipped: 1 });
    expect(appNotificationFindFirstMock).not.toHaveBeenCalled();
    expect(appNotificationCreateMock).not.toHaveBeenCalled();
  });

  it("skips documents with no valid_until without touching the transaction", async () => {
    managedDocumentFindManyMock.mockResolvedValue([{ ...dueSoon, valid_until: null }]);

    const response = await GET(cronRequest());
    const body = await response.json();

    expect(body).toEqual({ ok: true, scanned: 1, created: 0, skipped: 1 });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns a safe correlated 500 without exposing dependency details", async () => {
    managedDocumentFindManyMock.mockRejectedValue(new Error("DATABASE_URL=postgres://secret@db.internal"));

    const response = await GET(cronRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Cron-körningen misslyckades", errorCode: "INTERNAL_ERROR", requestId });
    expect(JSON.stringify(body)).not.toContain("postgres://secret");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "document expiry cron failed",
      expect.any(Error),
      expect.objectContaining({ event: "cron.failed", job: "document_expiry_reminders" }),
    );
  });
});
