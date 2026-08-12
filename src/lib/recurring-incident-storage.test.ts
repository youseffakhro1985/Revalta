import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryRawMock, findManyMock, createMock, transactionMock } = vi.hoisted(() => ({
  queryRawMock: vi.fn(),
  findManyMock: vi.fn(),
  createMock: vi.fn(),
  transactionMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: {
    $transaction: transactionMock,
  },
}));

// This sandbox cannot run `prisma generate` (network-restricted), so the real
// `@prisma/client` package has no generated runtime and `Prisma.sql` throws.
// Stub it with a minimal tagged-template so the advisory-lock query built in
// tryCreateRecurringIncidentEscalation can be constructed; $queryRaw itself is
// mocked above, so the actual SQL fragment contents are never inspected.
vi.mock("@prisma/client", () => ({
  Prisma: {
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
  },
}));

import { tryCreateRecurringIncidentEscalation } from "./recurring-incident-storage";

function tx() {
  return {
    $queryRaw: queryRawMock,
    recurringIncidentEvent: { findMany: findManyMock, create: createMock },
  };
}

describe("tryCreateRecurringIncidentEscalation — duplicate-escalation guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transactionMock.mockImplementation((callback: (tx: unknown) => unknown) => callback(tx()));
  });

  it("does not create a second escalation event once the key already reached that level", async () => {
    queryRawMock.mockResolvedValue([{ locked: true }]);
    // A concurrent/earlier run already recorded a level-2 escalation for this key.
    findManyMock.mockResolvedValue([{ payload: { level: 2 } }]);

    const result = await tryCreateRecurringIncidentEscalation({
      companyId: "company-1",
      notificationKey: "recurring-run:abc",
      level: 2,
      status: "level_2",
      payload: {},
    });

    expect(result).toEqual({ created: false, reason: "already_escalated" });
    expect(createMock).not.toHaveBeenCalled();
  });

  it("creates the escalation when the key has no prior escalation at this level", async () => {
    queryRawMock.mockResolvedValue([{ locked: true }]);
    findManyMock.mockResolvedValue([{ payload: { level: 1 } }]);
    createMock.mockResolvedValue({ id: "event-1" });

    const result = await tryCreateRecurringIncidentEscalation({
      companyId: "company-1",
      notificationKey: "recurring-run:abc",
      level: 2,
      status: "level_2",
      payload: { reason: "test" },
    });

    expect(result.created).toBe(true);
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          company_id: "company-1",
          notification_key: "recurring-run:abc",
          event_type: "escalation",
        }),
      }),
    );
  });

  it("skips without creating when a concurrent run holds the advisory lock", async () => {
    queryRawMock.mockResolvedValue([{ locked: false }]);

    const result = await tryCreateRecurringIncidentEscalation({
      companyId: "company-1",
      notificationKey: "recurring-run:abc",
      level: 1,
      status: "level_1",
      payload: {},
    });

    expect(result).toEqual({ created: false, reason: "locked" });
    expect(findManyMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });
});
