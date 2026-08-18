import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createLoggerMock,
  getCurrentUserMock,
  transactionMock,
} = vi.hoisted(() => ({
  createLoggerMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
  transactionMock: vi.fn(),
}));

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: getCurrentUserMock,
  canManageBilling: (role: string) => ["owner", "admin"].includes(role),
  tenantWhere: vi.fn(() => ({})),
}));
vi.mock("@/lib/db", () => ({
  default: {
    property: { count: vi.fn() },
    user: { count: vi.fn() },
    ticket: { count: vi.fn() },
    company: { findUnique: vi.fn() },
    $transaction: transactionMock,
  },
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/integrations", () => ({ recordPaymentEvent: vi.fn() }));
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

import { PATCH } from "./route";

const requestId = "550e8400-e29b-41d4-a716-446655440000";
function request(plan: string) {
  return new Request("https://www.revalta.se/api/billing", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "x-request-id": requestId },
    body: JSON.stringify({ plan }),
  });
}

describe("billing plan allowlist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", "preview");
    createLoggerMock.mockReturnValue({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() });
    getCurrentUserMock.mockResolvedValue({ id: "owner-1", company_id: "company-1", role: "owner" });
  });

  for (const prototypeKey of ["toString", "constructor", "__proto__"]) {
    it(`rejects prototype key ${prototypeKey} as an invalid plan`, async () => {
      const response = await PATCH(request(prototypeKey));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body).toEqual({ error: "Ogiltig plan", errorCode: "VALIDATION_FAILED", requestId });
      expect(transactionMock).not.toHaveBeenCalled();
    });
  }
});
