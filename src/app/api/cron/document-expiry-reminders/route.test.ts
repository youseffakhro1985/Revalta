import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  managedDocumentFindManyMock,
  appNotificationFindFirstMock,
  appNotificationCreateMock,
  auditLogCreateMock,
  createLoggerMock,
  loggerErrorMock,
  transactionMock,
} = vi.hoisted(() => ({
  managedDocumentFindManyMock: vi.fn(),
  appNotificationFindFirstMock: vi.fn(),
  appNotificationCreateMock: vi.fn(),
  auditLogCreateMock: vi.fn(),
  createLoggerMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  transactionMock: vi.fn(),
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

function cronRequest() {
  return new Request("https://www.revalta.se/api/cron/document-expiry-reminders", {
    headers: {
      authorization: "Bearer test-cron-secret",
      "x-request-id": "550e8400-e29b-41d4-a716-446655440004",
    },
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
    createLoggerMock.mockReturnValue({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: loggerErrorMock });
  });

  it("returns 401 without a valid CRON_SECRET", async () => {
    const response = await GET(new Request("https://www.revalta.se/api/cron/document-expiry-reminders"));
    expect(response.status).toBe(401);
    expect(managedDocumentFindManyMock).not.toHaveBeenCalled();
  });

  it("creates a reminder and audit log for a document that hasn't been notified yet", async () => {
    managedDocumentFindManyMock.mockResolvedValue([dueSoon]);
    const tx = txWith({ locked: true, existing: null });
    transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(tx));

    const response = await GET(cronRequest());
    const body = await response.json();

    expect(body).toEqual({ ok: true, scanned: 1, created: 1, skipped: 0 });
    expect(appNotificationCreateMock).toHaveBeenCalledTimes(1);
    expect(auditLogCreateMock).toHaveBeenCalledTimes(1);
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

  it("skips instead of double-sending when a concurrent/overlapping invocation already holds the lock", async () => {
    // Regression test: the dedupe check used to run outside any lock or
    // transaction, so two overlapping/retried cron invocations could both
    // pass it before either created a notification, producing duplicate
    // "document expiring" notifications and audit rows for the same
    // document.
    managedDocumentFindManyMock.mockResolvedValue([dueSoon]);
    const tx = txWith({ locked: false });
    transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(tx));

    const response = await GET(cronRequest());
    const body = await response.json();

    expect(body).toEqual({ ok: true, scanned: 1, created: 0, skipped: 1 });
    // Never even reached the dedupe read once the lock was lost.
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

  it("returns a safe correlated 500 when loading documents fails", async () => {
    managedDocumentFindManyMock.mockRejectedValue(new Error("postgres://user:secret@internal/revalta"));

    const response = await GET(cronRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "Internt serverfel",
      errorCode: "INTERNAL_ERROR",
      requestId: "550e8400-e29b-41d4-a716-446655440004",
    });
    expect(JSON.stringify(body)).not.toContain("postgres://");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "document expiry reminder cron failed",
      expect.any(Error),
      expect.objectContaining({ event: "cron.document_expiry_reminders.failed" }),
    );
  });
});
