import { describe, expect, it, vi } from "vitest";

const { prismaUseMock } = vi.hoisted(() => ({ prismaUseMock: vi.fn() }));

vi.mock("@prisma/client", () => ({
  PrismaClient: class PrismaClientMock {
    $use = prismaUseMock;
  },
  Prisma: {
    dmmf: {
      datamodel: {
        models: [
          {
            name: "User",
            fields: [
              { name: "company", kind: "object", type: "Company" },
              { name: "properties", kind: "object", type: "Property" },
              { name: "tickets", kind: "object", type: "Ticket" },
            ],
          },
          {
            name: "Company",
            fields: [{ name: "properties", kind: "object", type: "Property" }],
          },
          { name: "Property", fields: [] },
          { name: "Ticket", fields: [] },
          { name: "RateLimitAttempt", fields: [] },
        ],
      },
    },
  },
}));

vi.mock("@/lib/soft-delete-compat", () => ({
  SOFT_DELETE_MODELS: ["Property", "Ticket", "WorkOrder", "Project", "Lease", "LeaseHolder", "AppNotification", "OperationalDocument", "TicketOperation"],
  sanitizeSoftDeleteArgs: vi.fn(async (_client, _model, _action, args) => args),
}));

import { shouldSanitizeSoftDeleteParams } from "./db";

describe("shouldSanitizeSoftDeleteParams", () => {
  it("bypasses compatibility inspection for simple non-soft-delete models", () => {
    expect(shouldSanitizeSoftDeleteParams({ model: "RateLimitAttempt", action: "deleteMany" })).toBe(false);
    expect(shouldSanitizeSoftDeleteParams({ model: "RateLimitAttempt", action: "count" })).toBe(false);
    expect(shouldSanitizeSoftDeleteParams({
      model: "User",
      action: "findUnique",
      args: {
        where: { email: "owner@example.se" },
        select: { id: true, email: true, status: true, company: { select: { status: true } } },
      },
    })).toBe(false);
  });

  it("keeps compatibility inspection for a soft-delete model itself", () => {
    expect(shouldSanitizeSoftDeleteParams({ model: "Property", action: "findMany" })).toBe(true);
  });

  it("keeps compatibility inspection when a non-soft-delete query reads a soft-delete relation", () => {
    expect(shouldSanitizeSoftDeleteParams({
      model: "User",
      action: "findUnique",
      args: { select: { properties: true } },
    })).toBe(true);
    expect(shouldSanitizeSoftDeleteParams({
      model: "User",
      action: "findUnique",
      args: { select: { company: { select: { properties: true } } } },
    })).toBe(true);
  });

  it("keeps compatibility inspection when deleted_at appears anywhere in args", () => {
    expect(shouldSanitizeSoftDeleteParams({
      model: "User",
      action: "findMany",
      args: { where: { properties: { some: { deleted_at: null } } } },
    })).toBe(true);
  });

  it("still bypasses raw and connection-level operations", () => {
    expect(shouldSanitizeSoftDeleteParams({ action: "queryRaw" })).toBe(false);
    expect(shouldSanitizeSoftDeleteParams({ model: "Property", action: "queryRaw", args: { deleted_at: null } })).toBe(false);
  });
});
