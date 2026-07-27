import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  leaseFindFirstMock,
  managedDocumentFindFirstMock,
  auditLogFindFirstMock,
  auditLogCreateMock,
  getDocumentLifecycleStateMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  leaseFindFirstMock: vi.fn(),
  managedDocumentFindFirstMock: vi.fn(),
  auditLogFindFirstMock: vi.fn(),
  auditLogCreateMock: vi.fn(),
  getDocumentLifecycleStateMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/document-lifecycle", () => ({
  getDocumentLifecycleState: getDocumentLifecycleStateMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    lease: { findFirst: leaseFindFirstMock },
    managedDocument: { findFirst: managedDocumentFindFirstMock },
    auditLog: {
      findFirst: auditLogFindFirstMock,
      create: auditLogCreateMock,
    },
  },
}));

import { GET } from "./route";

const pdfBytes = Buffer.from("%PDF-1.4\n%âãÏÓ\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n", "utf8");
const pdfDataUrl = `data:application/pdf;base64,${pdfBytes.toString("base64")}`;

const residentUser = {
  id: "user-resident",
  company_id: "company-1",
  role: "resident",
  email: "boende@exempel.se",
};

const lease = {
  id: "lease-1",
  property_id: "property-1",
  unit_id: "unit-1",
  lease_number: "L-100",
};

const modernDocument = {
  id: "doc-1",
  name: "Hyresavtal",
  visibility: "resident_lease",
  property_id: "property-1",
  unit_id: "unit-1",
  lease_id: "lease-1",
  file_name: "hyresavtal.pdf",
  content_type: "application/pdf",
  size_bytes: pdfBytes.length,
  storage_url: null,
  data_url: pdfDataUrl,
  lifecycle_state: "active",
};

function downloadRequest(documentId = "doc-1", leaseId = "lease-1") {
  return new Request(
    `https://www.revalta.se/api/resident-portal/documents/${documentId}/download?leaseId=${leaseId}`,
  );
}

describe("resident document download route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    leaseFindFirstMock.mockResolvedValue(lease);
    managedDocumentFindFirstMock.mockResolvedValue(modernDocument);
    auditLogFindFirstMock.mockResolvedValue(null);
    auditLogCreateMock.mockResolvedValue({ id: "audit-1" });
    getDocumentLifecycleStateMock.mockResolvedValue({ state: "active" });
  });

  it("lets a resident download a document for an email-matched lease", async () => {
    getCurrentUserMock.mockResolvedValue(residentUser);

    const response = await GET(downloadRequest(), { params: Promise.resolve({ id: "doc-1" }) });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(leaseFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "lease-1",
        company_id: "company-1",
        lease_holder: expect.anything(),
      }),
    }));
    expect(auditLogCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "resident_portal.document_downloaded",
        metadata: expect.objectContaining({
          accessMode: "resident_self_service",
          leaseId: "lease-1",
        }),
      }),
    }));
  });

  it("hides documents when the resident lease email does not match", async () => {
    getCurrentUserMock.mockResolvedValue(residentUser);
    leaseFindFirstMock.mockResolvedValue(null);

    const response = await GET(downloadRequest(), { params: Promise.resolve({ id: "doc-1" }) });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Dokumentet hittades inte");
    expect(managedDocumentFindFirstMock).not.toHaveBeenCalled();
  });

  it("requires a leaseId", async () => {
    getCurrentUserMock.mockResolvedValue(residentUser);

    const response = await GET(
      new Request("https://www.revalta.se/api/resident-portal/documents/doc-1/download"),
      { params: Promise.resolve({ id: "doc-1" }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Hyresavtal krävs" });
  });

  it("denies roles without download permission", async () => {
    getCurrentUserMock.mockResolvedValue({
      ...residentUser,
      role: "viewer",
    });

    const response = await GET(downloadRequest(), { params: Promise.resolve({ id: "doc-1" }) });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Du saknar behörighet till boendedokument",
    });
  });

  it("lets operations staff preview without email-scoped lease filters", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "user-manager",
      company_id: "company-1",
      role: "manager",
      email: "forvaltare@exempel.se",
    });

    const response = await GET(downloadRequest(), { params: Promise.resolve({ id: "doc-1" }) });

    expect(response.status).toBe(200);
    expect(leaseFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.not.objectContaining({
        lease_holder: expect.anything(),
      }),
    }));
    expect(auditLogCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        metadata: expect.objectContaining({
          accessMode: "operations_preview",
        }),
      }),
    }));
  });

  it("blocks download when visibility is not resident-facing", async () => {
    getCurrentUserMock.mockResolvedValue(residentUser);
    managedDocumentFindFirstMock.mockResolvedValue({
      ...modernDocument,
      visibility: "internal",
    });

    const response = await GET(downloadRequest(), { params: Promise.resolve({ id: "doc-1" }) });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Du saknar behörighet till dokumentet",
    });
  });
});
