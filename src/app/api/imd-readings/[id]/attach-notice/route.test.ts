import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  user: vi.fn(), reading: vi.fn(), notice: vi.fn(), lease: vi.fn(), legacy: vi.fn(),
  create: vi.fn(), update: vi.fn(), claim: vi.fn(), debit: vi.fn(), audit: vi.fn(), transaction: vi.fn(),
}));
vi.mock("@/lib/current-user", async (original) => ({
  ...(await original<typeof import("@/lib/current-user")>()), getCurrentUser: mocks.user,
}));
vi.mock("@/lib/db", () => ({ default: { $transaction: mocks.transaction } }));
import { POST } from "./route";

const date = new Date("2026-09-07T12:00:00Z");
const tx = {
  imdReading: { findFirst: mocks.reading },
  rentNotice: { findFirst: mocks.notice, create: mocks.create, updateMany: mocks.update },
  lease: { findFirst: mocks.lease },
  imdDebitLine: { updateMany: mocks.claim, findFirst: mocks.debit },
  auditLog: { create: mocks.audit, findFirst: mocks.legacy },
};
const notice = {
  id: "notice-a", company_id: "company-a", property_id: "property-a", lease_id: "lease-a",
  status: "draft", unit: "1101", period: "2026-09", additions: new Prisma.Decimal("0.10"),
  indexed_rent: new Prisma.Decimal("1000"), deductions: new Prisma.Decimal("0"), updated_at: date, note: null,
};
const reading = {
  id: "reading-a", company_id: "company-a", property_id: "property-a", unit: "1101", period: "2026-09",
  voided_at: null, meter_type: "water", meter_id: "meter-a", charge: new Prisma.Decimal("0.20"),
  debit_line: {
    id: "debit-a", company_id: "company-a", property_id: "property-a", unit: "1101", period: "2026-09",
    charge: new Prisma.Decimal("0.20"), status: "open", lease_id: "lease-a", rent_notice_id: null, updated_at: date,
  },
};
function request(body: unknown = { rentNoticeId: "notice-a" }) {
  return POST(new Request("https://revalta.test/api/imd-readings/reading-a/attach-notice", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }), { params: Promise.resolve({ id: "reading-a" }) });
}

describe("IMD debit attachment", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.user.mockResolvedValue({ id: "owner-a", role: "owner", company_id: "company-a" });
    mocks.reading.mockResolvedValue(reading);
    mocks.notice.mockResolvedValue(notice);
    mocks.lease.mockResolvedValue({ id: "lease-a", monthly_rent: new Prisma.Decimal("1000"), lease_holder: { name: "Test" }, unit: { designation: "1101" } });
    mocks.create.mockImplementation(async ({ data }) => ({ ...notice, ...data, id: "notice-new" }));
    mocks.claim.mockResolvedValue({ count: 1 });
    mocks.update.mockResolvedValue({ count: 1 });
    mocks.debit.mockResolvedValue({ id: "debit-a", status: "linked", rent_notice_id: "notice-a" });
    mocks.audit.mockResolvedValue({ id: "audit-a" });
    mocks.transaction.mockImplementation(async (callback) => callback(tx));
  });

  it("adds a debit exactly once when creating a notice, in the audited transaction", async () => {
    const response = await request({ createNotice: true, leaseId: "lease-a", dueDate: "2026-09-30" });
    expect(response.status).toBe(200);
    expect(mocks.create.mock.calls[0][0].data.additions).toBe(0);
    const data = mocks.update.mock.calls[0][0].data;
    expect(data.additions.toFixed(2)).toBe("0.20");
    expect(data.total.toFixed(2)).toBe("1000.20");
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      company_id: "company-a", action: "imd.debit.linked", metadata: expect.objectContaining({ createdNotice: true }),
    }) }));
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
  });

  it("uses exact decimal addition for an existing draft and session-derived scope", async () => {
    const response = await request({ rentNoticeId: "notice-a", company_id: "company-b" });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-request-id")).toBeTruthy();
    expect(mocks.update.mock.calls[0][0].data.additions.toFixed(2)).toBe("0.30");
    expect(mocks.update.mock.calls[0][0].data.total.toFixed(2)).toBe("1000.30");
    expect(mocks.reading).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "reading-a", company_id: "company-a", property: { deleted_at: null } } }));
    expect(mocks.notice).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "notice-a", company_id: "company-a", property_id: "property-a", property: { deleted_at: null } } }));
    expect(mocks.lease).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ company_id: "company-a", property_id: "property-a", unit: { property_id: "property-a", designation: "1101" } }) }));
  });

  it.each(["technician", "viewer", "resident", "vendor", "unknown"])("rejects the %s role before database access", async (role) => {
    mocks.user.mockResolvedValue({ id: "user-a", role, company_id: "company-a" });
    expect((await request()).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("requires authentication", async () => {
    mocks.user.mockResolvedValue(null);
    expect((await request()).status).toBe(401);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("requires a company", async () => {
    mocks.user.mockResolvedValue({ id: "owner-a", role: "owner", company_id: null });
    expect((await request()).status).toBe(400);
  });
  it.each([null, [], {}, { createNotice: true, rentNoticeId: "notice-a" }, { createNotice: true, dueDate: "2026-02-31" }])("rejects invalid input %j", async (body) => {
    expect((await request(body)).status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("rejects malformed JSON", async () => {
    expect((await POST(new Request("https://revalta.test", { method: "POST", body: "{" }), { params: Promise.resolve({ id: "reading-a" }) })).status).toBe(400);
  });
  it("hides foreign or deleted readings", async () => {
    mocks.reading.mockResolvedValue(null);
    mocks.legacy.mockResolvedValue(null);
    expect((await request()).status).toBe(404);
    expect(mocks.claim).not.toHaveBeenCalled();
  });
  it("blocks unmigrated legacy readings", async () => {
    mocks.reading.mockResolvedValue(null);
    mocks.legacy.mockResolvedValue({ metadata: {} });
    expect((await request()).status).toBe(409);
  });
  it.each([
    { voided_at: date }, { debit_line: null },
    ...[{ status: "linked", rent_notice_id: "notice-a" }, { status: "voided" }, { status: "unexpected" },
      { rent_notice_id: "notice-a" }, { company_id: "company-b" }, { property_id: "property-b" },
      { unit: "1102" }, { period: "2026-08" }, { charge: new Prisma.Decimal("20") }]
      .map((change) => ({ debit_line: { ...reading.debit_line, ...change } })),
  ])("blocks an inconsistent or terminal debit (%j)", async (change) => {
    mocks.reading.mockResolvedValue({ ...reading, ...change });
    expect((await request()).status).toBe(409);
    expect(mocks.claim).not.toHaveBeenCalled();
  });
  it.each([{ status: "sent" }, { status: "paid" }, { status: "credited" }, { unit: "1102" }, { period: "2026-08" }, { lease_id: "lease-b" }, { lease_id: null }])("rejects wrong or immutable notice (%j)", async (change) => {
    mocks.notice.mockResolvedValue({ ...notice, ...change });
    expect((await request()).status).toBe(409);
    expect(mocks.claim).not.toHaveBeenCalled();
  });
  it("does not fall back to creating a notice for a missing or foreign id", async () => {
    mocks.notice.mockResolvedValue(null);
    expect((await request()).status).toBe(404);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rejects a supplied lease that differs from the debit", async () => {
    expect((await request({ createNotice: true, leaseId: "lease-b" })).status).toBe(409);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rejects a lease outside the scoped property/unit", async () => {
    mocks.lease.mockResolvedValue(null);
    expect((await request({ createNotice: true, leaseId: "lease-a" })).status).toBe(404);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each(["claim", "update"] as const)("rejects a lost %s and never commits the transaction", async (key) => {
    mocks[key].mockResolvedValue({ count: 0 });
    const rolledBack = vi.fn();
    mocks.transaction.mockImplementation(async (callback) => {
      try { return await callback(tx); } catch (error) { rolledBack(); throw error; }
    });
    expect((await request({ createNotice: true, leaseId: "lease-a" })).status).toBe(409);
    expect(rolledBack).toHaveBeenCalledOnce();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("propagates audit failure out of the transaction without leaking provider details", async () => {
    mocks.audit.mockRejectedValue(new Error("postgres://sensitive provider details"));
    const response = await request();
    expect(response.status).toBe(500);
    expect(await response.text()).not.toMatch(/postgres|sensitive|provider/);
  });
  it("returns a retryable conflict for an actual Prisma serialization error", async () => {
    mocks.transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("conflict", { code: "P2034", clientVersion: "5.22.0" }));
    expect((await request()).status).toBe(409);
  });
});
