import { beforeEach, describe, expect, it, vi } from "vitest";

const { defaultCreateMock, transactionCreateMock } = vi.hoisted(() => ({
  defaultCreateMock: vi.fn(),
  transactionCreateMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: { auditLog: { create: defaultCreateMock } },
}));

import { writeAuditLog } from "./audit";

describe("writeAuditLog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("writes through the supplied transaction client", async () => {
    transactionCreateMock.mockResolvedValue({ id: "audit-1" });

    await writeAuditLog(
      { id: "user-1", company_id: "company-1" },
      { entityType: "ticket", entityId: "ticket-1", action: "ticket.created" },
      { auditLog: { create: transactionCreateMock } } as never,
    );

    expect(transactionCreateMock).toHaveBeenCalledTimes(1);
    expect(defaultCreateMock).not.toHaveBeenCalled();
  });
});
