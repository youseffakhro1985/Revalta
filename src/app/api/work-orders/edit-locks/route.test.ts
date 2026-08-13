import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  sqlSoftDeleteGuardMock,
  executeRawMock,
  queryRawMock,
  transactionMock,
  notificationCreateMock,
  auditLogCreateMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  sqlSoftDeleteGuardMock: vi.fn(),
  executeRawMock: vi.fn(),
  queryRawMock: vi.fn(),
  transactionMock: vi.fn(),
  notificationCreateMock: vi.fn(),
  auditLogCreateMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/soft-delete-compat", () => ({
  sqlSoftDeleteGuard: sqlSoftDeleteGuardMock,
}));

// This sandbox cannot run `prisma generate` (network-restricted), so the real
// `@prisma/client` package has no generated runtime and `Prisma.sql` throws.
// Stub it with a minimal tagged-template so route-level queries can be built;
// the mocked $queryRaw/$executeRaw/$transaction below never inspect the real
// SQL text, only the interpolated values captured here.
vi.mock("@prisma/client", () => ({
  Prisma: {
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
    TransactionIsolationLevel: { Serializable: "Serializable" },
  },
}));

vi.mock("@/lib/db", () => {
  const dbMock = {
    $executeRaw: executeRawMock,
    $queryRaw: queryRawMock,
    $transaction: transactionMock,
    workOrderLockNotification: { create: notificationCreateMock },
    auditLog: { create: auditLogCreateMock },
  };
  transactionMock.mockImplementation((callback: (tx: typeof dbMock) => unknown) => callback(dbMock));
  return { default: dbMock };
});

import { DELETE, GET } from "./route";

type SqlCall = { strings: readonly string[]; values: unknown[] };

/** Reconstructs the interpolated SQL text from a Prisma.sql-mock call, for structural assertions. */
function sqlText(call: SqlCall) {
  return call.strings.reduce((acc, part, i) => `${acc}${part}${i < call.values.length ? String(call.values[i]) : ""}`, "");
}

const NOW = new Date("2026-08-13T10:00:00.000Z");

const owner = { id: "user-1", company_id: "company-1", role: "owner", name: "Anna Ägare", email: "anna@example.com" };

function deleteRequest(body: unknown) {
  return new Request("http://localhost/api/work-orders/edit-locks", {
    method: "DELETE",
    body: JSON.stringify(body),
  });
}

describe("work-orders/edit-locks", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.clearAllMocks();
    sqlSoftDeleteGuardMock.mockResolvedValue("");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("GET", () => {
    it("returns 401 when unauthenticated", async () => {
      getCurrentUserMock.mockResolvedValue(null);

      const response = await GET();

      expect(response.status).toBe(401);
      expect(queryRawMock).not.toHaveBeenCalled();
    });

    it("returns 403 for a role that cannot view operations", async () => {
      getCurrentUserMock.mockResolvedValue({ id: "user-2", company_id: "company-1", role: "resident" });

      const response = await GET();

      expect(response.status).toBe(403);
      expect(queryRawMock).not.toHaveBeenCalled();
    });

    it("returns active locks scoped to the caller's company with correctly computed remainingSeconds", async () => {
      getCurrentUserMock.mockResolvedValue(owner);
      executeRawMock.mockResolvedValue(3);
      const rows = [
        {
          work_order_id: "wo-1",
          work_order_number: "WO-1",
          title: "Byt lås",
          status: "in_progress",
          priority: "high",
          property_id: "prop-1",
          property_name: "Storgatan 1",
          property_address: "Storgatan 1, Stockholm",
          user_id: "user-2",
          user_name: "Bo Tekniker",
          user_email: "bo@example.com",
          acquired_at: new Date(NOW.getTime() - 60_000),
          expires_at: new Date(NOW.getTime() + 90_000),
          updated_at: new Date(NOW.getTime() - 10_000),
        },
      ];
      queryRawMock.mockResolvedValue(rows);

      const response = await GET();
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.removedExpired).toBe(3);
      expect(body.canForceRelease).toBe(true);
      expect(body.locks).toHaveLength(1);
      expect(body.locks[0]).toMatchObject({
        workOrderId: "wo-1",
        property: { id: "prop-1", name: "Storgatan 1", address: "Storgatan 1, Stockholm" },
        holder: { id: "user-2", name: "Bo Tekniker", email: "bo@example.com" },
        remainingSeconds: 90,
      });

      // Cleanup of expired locks runs before the select, scoped to the caller's company.
      expect(executeRawMock).toHaveBeenCalledTimes(1);
      const cleanupCall = executeRawMock.mock.calls[0][0] as SqlCall;
      expect(cleanupCall.values[0]).toBe("company-1");
      expect(sqlText(cleanupCall)).toContain('expires_at" <= CURRENT_TIMESTAMP');

      const selectCall = queryRawMock.mock.calls[0][0] as SqlCall;
      expect(selectCall.values[0]).toBe("company-1");
      expect(sqlText(selectCall)).toContain('l."company_id" = company-1');
      expect(sqlText(selectCall)).toContain('expires_at" > CURRENT_TIMESTAMP');
    });

    it("computes remainingSeconds as 0 (never negative) for a lock on the edge of expiry", async () => {
      getCurrentUserMock.mockResolvedValue(owner);
      executeRawMock.mockResolvedValue(0);
      queryRawMock.mockResolvedValue([
        {
          work_order_id: "wo-2",
          work_order_number: null,
          title: "Kontroll",
          status: "open",
          priority: "low",
          property_id: "prop-2",
          property_name: "Kungsgatan 5",
          property_address: "Kungsgatan 5",
          user_id: "user-3",
          user_name: null,
          user_email: "c@example.com",
          acquired_at: new Date(NOW.getTime() - 5_000),
          expires_at: new Date(NOW.getTime() - 1),
          updated_at: NOW,
        },
      ]);

      const response = await GET();
      const body = await response.json();

      expect(body.locks[0].remainingSeconds).toBe(0);
    });

    it("only ever queries with the caller's own company_id, never a hardcoded or foreign tenant", async () => {
      const otherCompanyUser = { id: "user-9", company_id: "company-2", role: "admin", name: "Other", email: "o@example.com" };
      getCurrentUserMock.mockResolvedValue(otherCompanyUser);
      executeRawMock.mockResolvedValue(0);
      queryRawMock.mockResolvedValue([]);

      await GET();

      const cleanupCall = executeRawMock.mock.calls[0][0] as SqlCall;
      const selectCall = queryRawMock.mock.calls[0][0] as SqlCall;
      expect(cleanupCall.values[0]).toBe("company-2");
      expect(selectCall.values[0]).toBe("company-2");
    });
  });

  describe("DELETE", () => {
    function lockRow(overrides: Partial<{
      work_order_id: string;
      work_order_number: string | null;
      title: string;
      user_id: string;
      user_name: string | null;
      user_email: string;
      expires_at: Date;
    }> = {}) {
      return {
        work_order_id: "wo-1",
        work_order_number: "WO-1",
        title: "Byt lås",
        user_id: "user-2",
        user_name: "Bo Tekniker",
        user_email: "bo@example.com",
        expires_at: new Date(NOW.getTime() + 90_000),
        ...overrides,
      };
    }

    it("returns 401 when unauthenticated", async () => {
      getCurrentUserMock.mockResolvedValue(null);

      const response = await DELETE(deleteRequest({ workOrderId: "wo-1", reason: "Fastnat i låst läge" }));

      expect(response.status).toBe(401);
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it("returns 403 for a role that cannot force-release locks", async () => {
      getCurrentUserMock.mockResolvedValue({ id: "user-4", company_id: "company-1", role: "manager" });

      const response = await DELETE(deleteRequest({ workOrderId: "wo-1", reason: "Fastnat i låst läge" }));

      expect(response.status).toBe(403);
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it("returns 400 when reason is missing", async () => {
      getCurrentUserMock.mockResolvedValue(owner);

      const response = await DELETE(deleteRequest({ workOrderId: "wo-1" }));

      expect(response.status).toBe(400);
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it("returns 400 when reason is whitespace-only", async () => {
      getCurrentUserMock.mockResolvedValue(owner);

      const response = await DELETE(deleteRequest({ workOrderId: "wo-1", reason: "   " }));

      expect(response.status).toBe(400);
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it("returns 400 when reason exceeds 500 characters", async () => {
      getCurrentUserMock.mockResolvedValue(owner);

      const response = await DELETE(deleteRequest({ workOrderId: "wo-1", reason: "x".repeat(501) }));

      expect(response.status).toBe(400);
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it("returns 400 when workOrderId is missing", async () => {
      getCurrentUserMock.mockResolvedValue(owner);

      const response = await DELETE(deleteRequest({ reason: "Fastnat i låst läge" }));

      expect(response.status).toBe(400);
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it("force-releases the lock, writes a notification and an audit log, and returns 200", async () => {
      getCurrentUserMock.mockResolvedValue(owner);
      queryRawMock.mockResolvedValue([lockRow()]);
      executeRawMock.mockResolvedValue(1);
      notificationCreateMock.mockResolvedValue({});
      auditLogCreateMock.mockResolvedValue({});

      const response = await DELETE(deleteRequest({ workOrderId: "wo-1", reason: "Anställd slutade" }));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ released: true, workOrderId: "wo-1", notifiedUserId: "user-2" });

      const selectCall = queryRawMock.mock.calls[0][0] as SqlCall;
      expect(selectCall.values).toEqual(["wo-1", "company-1", ""]);

      const deleteCall = executeRawMock.mock.calls[0][0] as SqlCall;
      expect(deleteCall.values).toEqual(["wo-1", "company-1"]);

      expect(notificationCreateMock).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          company_id: "company-1",
          work_order_id: "wo-1",
          recipient_user_id: "user-2",
          reason: "Anställd slutade",
          released_by_id: "user-1",
        }),
      }));

      expect(auditLogCreateMock).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          company_id: "company-1",
          actor_user_id: "user-1",
          entity_type: "work_order",
          entity_id: "wo-1",
          action: "work_order.edit_lock.force_released",
          metadata: expect.objectContaining({
            previousHolderId: "user-2",
            reason: "Anställd slutade",
          }),
        }),
      }));
    });

    it("returns 404 and performs no writes when the lock does not exist (or already expired)", async () => {
      getCurrentUserMock.mockResolvedValue(owner);
      queryRawMock.mockResolvedValue([]);

      const response = await DELETE(deleteRequest({ workOrderId: "wo-missing", reason: "Fastnat i låst läge" }));

      expect(response.status).toBe(404);
      expect(executeRawMock).not.toHaveBeenCalled();
      expect(notificationCreateMock).not.toHaveBeenCalled();
      expect(auditLogCreateMock).not.toHaveBeenCalled();
    });

    it("returns 409 without writing side effects when the delete races and removes zero rows", async () => {
      getCurrentUserMock.mockResolvedValue(owner);
      queryRawMock.mockResolvedValue([lockRow()]);
      executeRawMock.mockResolvedValue(0);

      const response = await DELETE(deleteRequest({ workOrderId: "wo-1", reason: "Fastnat i låst läge" }));

      expect(response.status).toBe(409);
      expect(notificationCreateMock).not.toHaveBeenCalled();
      expect(auditLogCreateMock).not.toHaveBeenCalled();
    });

    it("never targets another company's lock: scopes the lookup and the delete by the caller's company_id", async () => {
      // Simulate the real DB: the lock for wo-1 belongs to company-2, so a company-1
      // admin's scoped WHERE clause finds nothing, regardless of the workOrderId matching.
      const fakeStorage: Record<string, string> = { "wo-1": "company-2" };
      getCurrentUserMock.mockResolvedValue(owner); // company-1
      queryRawMock.mockImplementation(async (call: SqlCall) => {
        const [workOrderId, companyId] = call.values as [string, string, unknown];
        if (fakeStorage[workOrderId] === companyId) return [lockRow({ work_order_id: workOrderId })];
        return [];
      });

      const response = await DELETE(deleteRequest({ workOrderId: "wo-1", reason: "Försök frigöra annans lås" }));
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body.error).toBeTruthy();
      expect(executeRawMock).not.toHaveBeenCalled();
      expect(notificationCreateMock).not.toHaveBeenCalled();
      expect(auditLogCreateMock).not.toHaveBeenCalled();

      const selectCall = queryRawMock.mock.calls[0][0] as SqlCall;
      expect(selectCall.values[1]).toBe("company-1");
    });
  });
});
