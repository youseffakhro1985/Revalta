import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  integrationEventFindManyMock,
  invoiceJobGroupByMock,
  hasStorageConfigMock,
  isStripeBillingReadyMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  integrationEventFindManyMock: vi.fn(),
  invoiceJobGroupByMock: vi.fn(),
  hasStorageConfigMock: vi.fn(),
  isStripeBillingReadyMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/storage", () => ({ hasStorageConfig: hasStorageConfigMock }));
vi.mock("@/lib/stripe", () => ({ isStripeBillingReady: isStripeBillingReadyMock }));

vi.mock("@/lib/db", () => ({
  default: {
    integrationEvent: { findMany: integrationEventFindManyMock },
    workOrderInvoiceExportJob: { groupBy: invoiceJobGroupByMock },
  },
}));

import { GET } from "./route";

describe("integrations summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    integrationEventFindManyMock.mockResolvedValue([]);
    invoiceJobGroupByMock.mockResolvedValue([]);
    hasStorageConfigMock.mockReturnValue(false);
    isStripeBillingReadyMock.mockReturnValue(false);
  });

  it("aggregates invoice export job status counts via groupBy instead of fetching every row", async () => {
    invoiceJobGroupByMock.mockResolvedValue([
      { status: "queued", _count: { _all: 3 } },
      { status: "processing", _count: { _all: 1 } },
      { status: "failed", _count: { _all: 2 } },
      { status: "sent", _count: { _all: 40 } },
    ]);

    const response = await GET();
    const body = await response.json();

    expect(invoiceJobGroupByMock).toHaveBeenCalledWith({
      by: ["status"],
      where: { company_id: "company-1" },
      _count: { _all: true },
    });
    expect(body.invoiceExportSummary).toEqual({
      total: 46,
      active: 4,
      failed: 2,
      sent: 40,
    });
  });

  it("returns zeroed counts when there are no invoice export jobs", async () => {
    const response = await GET();
    const body = await response.json();

    expect(body.invoiceExportSummary).toEqual({ total: 0, active: 0, failed: 0, sent: 0 });
  });

  it("uses canonical full Stripe billing readiness instead of the secret pair alone", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_example");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_example");
    isStripeBillingReadyMock.mockReturnValue(false);

    const response = await GET();
    const body = await response.json();
    const stripe = body.integrations.find((integration: { type: string }) => integration.type === "stripe");

    expect(stripe).toEqual({
      type: "stripe",
      configured: false,
      requiredEnv: [
        "STRIPE_SECRET_KEY",
        "STRIPE_WEBHOOK_SECRET",
        "STRIPE_PRICE_START",
        "STRIPE_PRICE_PROFESSIONAL",
        "STRIPE_PRICE_ENTERPRISE",
      ],
    });
    expect(isStripeBillingReadyMock).toHaveBeenCalled();
  });

  it("reports Stripe configured only when the canonical billing readiness passes", async () => {
    isStripeBillingReadyMock.mockReturnValue(true);

    const response = await GET();
    const body = await response.json();
    const stripe = body.integrations.find((integration: { type: string }) => integration.type === "stripe");

    expect(stripe.configured).toBe(true);
  });

  it("reports demo lead delivery separately from generic email configuration", async () => {
    vi.stubEnv("EMAIL_PROVIDER_API_KEY", "resend-key");
    vi.stubEnv("EMAIL_FROM", "noreply@revalta.se");
    vi.stubEnv("DEMO_REQUEST_TO", "");

    const response = await GET();
    const body = await response.json();
    const email = body.integrations.find((integration: { type: string }) => integration.type === "email");
    const demoLeads = body.integrations.find((integration: { type: string }) => integration.type === "demo_leads");

    expect(email.configured).toBe(true);
    expect(demoLeads).toEqual({
      type: "demo_leads",
      configured: false,
      requiredEnv: ["EMAIL_PROVIDER_API_KEY", "EMAIL_FROM", "DEMO_REQUEST_TO"],
    });
  });

  it("reports demo lead delivery configured only when the recipient is present too", async () => {
    vi.stubEnv("EMAIL_PROVIDER_API_KEY", "resend-key");
    vi.stubEnv("EMAIL_FROM", "noreply@revalta.se");
    vi.stubEnv("DEMO_REQUEST_TO", "sales@revalta.se");

    const response = await GET();
    const body = await response.json();
    const demoLeads = body.integrations.find((integration: { type: string }) => integration.type === "demo_leads");

    expect(demoLeads.configured).toBe(true);
  });

  it("shows both modern and legacy storage tokens while using the canonical storage readiness", async () => {
    hasStorageConfigMock.mockReturnValue(true);

    const response = await GET();
    const body = await response.json();
    const storage = body.integrations.find((integration: { type: string }) => integration.type === "storage");

    expect(storage).toEqual({
      type: "storage",
      configured: true,
      requiredEnv: ["BLOB_READ_WRITE_TOKEN", "STORAGE_PROVIDER_KEY"],
    });
  });
});
