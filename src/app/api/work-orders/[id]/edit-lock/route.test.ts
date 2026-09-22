import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  findAccessibleWorkOrderMock,
  getWorkOrderEditLockMock,
  acquireWorkOrderEditLockMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  findAccessibleWorkOrderMock: vi.fn(),
  getWorkOrderEditLockMock: vi.fn(),
  acquireWorkOrderEditLockMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/assigned-work-access", () => ({
  findAccessibleWorkOrder: findAccessibleWorkOrderMock,
  notFoundWorkOrder: () => Response.json({ error: "Arbetsordern hittades inte" }, { status: 404 }),
}));

vi.mock("@/lib/work-order-edit-lock", () => ({
  getWorkOrderEditLock: getWorkOrderEditLockMock,
  acquireWorkOrderEditLock: acquireWorkOrderEditLockMock,
  releaseWorkOrderEditLock: vi.fn(),
  renewWorkOrderEditLock: vi.fn(),
}));

import { GET, POST } from "./route";
import { Prisma } from "@prisma/client";
import { schemaMismatchUserMessage } from "@/lib/schema-readiness";

const params = { params: Promise.resolve({ id: "wo-1" }) };

describe("work-order edit-lock GET staff-scope", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects residents before looking up the work order or lock holder", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });

    const response = await GET(
      new Request("https://www.revalta.se/api/work-orders/wo-1/edit-lock"),
      params,
    );

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(findAccessibleWorkOrderMock).not.toHaveBeenCalled();
    expect(getWorkOrderEditLockMock).not.toHaveBeenCalled();
  });

  it("POST rejects residents before looking up the work order", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });
    const response = await POST(
      new Request("https://www.revalta.se/api/work-orders/wo-1/edit-lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "acquire" }),
      }),
      params,
    );
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(findAccessibleWorkOrderMock).not.toHaveBeenCalled();
  });

  it("POST denies viewers with the edit-lock copy", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "viewer-1", company_id: "company-1", role: "viewer" });
    const response = await POST(
      new Request("https://www.revalta.se/api/work-orders/wo-1/edit-lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "acquire" }),
      }),
      params,
    );
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet att redigera arbetsordrar");
    expect(findAccessibleWorkOrderMock).not.toHaveBeenCalled();
  });
});

describe("work-order edit-lock schema gaps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue({ id: "owner-1", company_id: "company-1", role: "owner" });
    findAccessibleWorkOrderMock.mockResolvedValue({ id: "wo-1" });
  });

  it("maps a missing WorkOrderEditLock table on acquire to 503 SERVICE_UNAVAILABLE", async () => {
    acquireWorkOrderEditLockMock.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        "The table `public.WorkOrderEditLock` does not exist in the current database.",
        {
          code: "P2021",
          clientVersion: "test",
          meta: { table: "public.WorkOrderEditLock" },
        },
      ),
    );

    const response = await POST(
      new Request("https://www.revalta.se/api/work-orders/wo-1/edit-lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "acquire" }),
      }),
      params,
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toBe(schemaMismatchUserMessage());
    expect(body.errorCode).toBe("SERVICE_UNAVAILABLE");
  });

  it("returns 500 INTERNAL_ERROR without leaking unexpected acquire failures", async () => {
    acquireWorkOrderEditLockMock.mockRejectedValue(new Error("boom"));

    const response = await POST(
      new Request("https://www.revalta.se/api/work-orders/wo-1/edit-lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "acquire" }),
      }),
      params,
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "Kunde inte hantera redigeringslåset",
      errorCode: "INTERNAL_ERROR",
    });
  });

  it("keeps a missing lock token as field validation", async () => {
    const response = await POST(
      new Request("https://www.revalta.se/api/work-orders/wo-1/edit-lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "release" }),
      }),
      params,
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Låstoken krävs");
    expect(acquireWorkOrderEditLockMock).not.toHaveBeenCalled();
  });
});
