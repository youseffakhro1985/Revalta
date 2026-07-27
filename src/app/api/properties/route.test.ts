import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  requireCompanyUserMock,
  canCreatePropertiesMock,
  propertyFindManyMock,
  propertyCreateMock,
  writeAuditLogMock,
  notDeletedFilterMock,
  isMissingSchemaColumnErrorMock,
  schemaMismatchUserMessageMock,
  loggerInfoMock,
  loggerWarnMock,
  loggerErrorMock,
  createLoggerMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  requireCompanyUserMock: vi.fn(),
  canCreatePropertiesMock: vi.fn(),
  propertyFindManyMock: vi.fn(),
  propertyCreateMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  notDeletedFilterMock: vi.fn(),
  isMissingSchemaColumnErrorMock: vi.fn(),
  schemaMismatchUserMessageMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  createLoggerMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: {
    property: {
      findMany: propertyFindManyMock,
      create: propertyCreateMock,
    },
  },
}));

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: getCurrentUserMock,
  requireCompanyUser: requireCompanyUserMock,
  canCreateProperties: canCreatePropertiesMock,
}));

vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));
vi.mock("@/lib/schema-readiness", () => ({
  notDeletedFilter: notDeletedFilterMock,
  isMissingSchemaColumnError: isMissingSchemaColumnErrorMock,
  schemaMismatchUserMessage: schemaMismatchUserMessageMock,
}));
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

import { GET, POST } from "./route";

const requestId = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const companyUser = {
  id: "user-1",
  email: "owner@example.se",
  name: "Owner",
  role: "owner",
  status: "active",
  company_id: "company-1",
  email_verified_at: new Date(),
  created_at: new Date(),
  company: { id: "company-1", name: "Revalta AB", plan: "professional", status: "active" },
};

function getRequest() {
  return new Request("https://www.revalta.se/api/properties", {
    headers: { "x-request-id": requestId },
  });
}

function postRequest(body: Record<string, unknown> | string) {
  return new Request("https://www.revalta.se/api/properties", {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": requestId },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function expectPrivateNoStore(response: Response) {
  expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0, must-revalidate");
  expect(response.headers.get("cdn-cache-control")).toBe("no-store");
  expect(response.headers.get("vercel-cdn-cache-control")).toBe("no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("x-request-id")).toBe(requestId);
}

describe("properties API tenant isolation and observability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue(companyUser);
    requireCompanyUserMock.mockImplementation((user) => user);
    canCreatePropertiesMock.mockReturnValue(true);
    notDeletedFilterMock.mockImplementation(async (model: string) =>
      model === "Property" ? { deleted_at: null } : { deleted_at: null },
    );
    isMissingSchemaColumnErrorMock.mockReturnValue(false);
    schemaMismatchUserMessageMock.mockReturnValue("Databasen uppdateras. Försök igen senare.");
    createLoggerMock.mockReturnValue({
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
  });

  it("fails closed before querying when no staff company user exists", async () => {
    requireCompanyUserMock.mockReturnValue(null);

    const response = await GET(getRequest());
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toEqual({ error: "Obehörig", errorCode: "UNAUTHORIZED", requestId });
    expect(propertyFindManyMock).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("always scopes property listing to the authenticated company", async () => {
    propertyFindManyMock.mockResolvedValue([
      {
        id: "property-1",
        name: "Kvarteret Eken",
        address: "Exempelgatan 1",
        postal_code: "411 01",
        city: "Göteborg",
        property_identifier: null,
        property_type: "residential",
        status: "active",
        created_at: new Date(),
        updated_at: new Date(),
        _count: { tickets: 2, buildings: 1, units: 10 },
      },
    ]);

    const response = await GET(getRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(propertyFindManyMock).toHaveBeenCalledOnce();
    expect(propertyFindManyMock.mock.calls[0][0].where).toEqual({
      deleted_at: null,
      company_id: companyUser.company_id,
    });
    expect(payload.requestId).toBe(requestId);
    expect(payload.permissions).toEqual({ canCreate: true });
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "properties listed",
      expect.objectContaining({
        eventCode: "properties.list.succeeded",
        companyId: companyUser.company_id,
        resultCount: 1,
      }),
    );
    expectPrivateNoStore(response);
  });

  it("returns a standardized 503 when the deployed schema is not ready", async () => {
    const error = new Error("missing column");
    propertyFindManyMock.mockRejectedValue(error);
    isMissingSchemaColumnErrorMock.mockReturnValue(true);

    const response = await GET(getRequest());
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toEqual({
      error: "Databasen uppdateras. Försök igen senare.",
      errorCode: "SERVICE_UNAVAILABLE",
      requestId,
    });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "properties schema unavailable",
      error,
      expect.objectContaining({ eventCode: "properties.list.schema_unavailable" }),
    );
    expectPrivateNoStore(response);
  });

  it("rejects property creation before database access when permission is missing", async () => {
    canCreatePropertiesMock.mockReturnValue(false);

    const response = await POST(
      postRequest({ name: "Eken", address: "Exempelgatan 1", city: "Göteborg" }),
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload).toEqual({
      error: "Du saknar behörighet att skapa fastigheter",
      errorCode: "FORBIDDEN",
      requestId,
    });
    expect(propertyCreateMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("handles malformed JSON as a validation error without leaking input", async () => {
    const response = await POST(postRequest("{not-json"));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      error: "Namn, adress och ort krävs",
      errorCode: "VALIDATION_FAILED",
      requestId,
    });
    expect(propertyCreateMock).not.toHaveBeenCalled();
    expect(JSON.stringify(loggerInfoMock.mock.calls)).not.toContain("not-json");
    expectPrivateNoStore(response);
  });

  it("creates a property only inside the authenticated company and writes an audit record", async () => {
    const property = {
      id: "property-1",
      name: "Kvarteret Eken",
      address: "Exempelgatan 1",
      postal_code: "411 01",
      city: "Göteborg",
      property_identifier: null,
      property_type: "residential",
      status: "active",
      created_at: new Date(),
      updated_at: new Date(),
      _count: { tickets: 0, buildings: 0, units: 0 },
    };
    propertyCreateMock.mockResolvedValue(property);

    const response = await POST(
      postRequest({
        name: "  Kvarteret Eken  ",
        address: "  Exempelgatan 1  ",
        postalCode: "  411 01  ",
        city: "  Göteborg  ",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(propertyCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          name: "Kvarteret Eken",
          address: "Exempelgatan 1",
          postal_code: "411 01",
          city: "Göteborg",
          company_id: companyUser.company_id,
          user_id: companyUser.id,
        },
      }),
    );
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      companyUser,
      expect.objectContaining({
        entityType: "property",
        entityId: property.id,
        action: "property.created",
      }),
    );
    expect(payload).toEqual({ success: true, property: expect.any(Object), requestId });
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "property created",
      expect.objectContaining({
        eventCode: "properties.create.succeeded",
        companyId: companyUser.company_id,
        propertyId: property.id,
      }),
    );
    expectPrivateNoStore(response);
  });

  it("returns a standardized 500 and does not expose the thrown error", async () => {
    const error = new Error("database password secret-value");
    propertyCreateMock.mockRejectedValue(error);

    const response = await POST(
      postRequest({ name: "Eken", address: "Exempelgatan 1", city: "Göteborg" }),
    );
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toEqual({ error: "Internt serverfel", errorCode: "INTERNAL_ERROR", requestId });
    expect(JSON.stringify(payload)).not.toContain("secret-value");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "property creation failed",
      error,
      expect.objectContaining({ eventCode: "properties.create.failed" }),
    );
    expectPrivateNoStore(response);
  });
});
