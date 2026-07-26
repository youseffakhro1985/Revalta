import { afterEach, describe, expect, it, vi } from "vitest";
import { allowIntegrationMocks, isProductionRuntime } from "./runtime-env";
import { createPortalTrackingToken, verifyPortalTrackingToken } from "./portal-tracking";
import { validateUploadFile } from "./document-file-security";
import { calculateWorkOrderSla } from "./work-order-enterprise-core";

describe("production-hardening smoke", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fail-closed integrations i produktion", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_INTEGRATION_MOCKS", "");
    expect(isProductionRuntime()).toBe(true);
    expect(allowIntegrationMocks()).toBe(false);
  });

  it("portal tracking tokens är HMAC-verifierbara", () => {
    vi.stubEnv("JWT_SECRET", "test-jwt-secret-for-smoke-checks");
    const token = createPortalTrackingToken({
      companyId: "company-1",
      reference: "RV-1001",
      email: "boende@example.com",
    });
    const verified = verifyPortalTrackingToken(token);
    expect(verified?.companyId).toBe("company-1");
    expect(verified?.reference).toBe("RV-1001");
    expect(verified?.email).toBe("boende@example.com");
  });

  it("filuppladdning avvisar osäkra typer", () => {
    const result = validateUploadFile({
      bytes: new Uint8Array([0x4d, 0x5a]),
      contentType: "application/x-msdownload",
      fileName: "payload.exe",
      profile: "document",
    });
    expect(result.ok).toBe(false);
  });

  it("enterprise-SLA använder kanonisk policy", () => {
    const from = new Date("2026-07-26T08:00:00.000Z");
    const sla = calculateWorkOrderSla(from, "urgent");
    expect(sla.responseDueAt.toISOString()).toBe("2026-07-26T09:00:00.000Z");
    expect(sla.resolutionDueAt.toISOString()).toBe("2026-07-26T12:00:00.000Z");
  });
});
