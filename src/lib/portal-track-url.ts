import { getPublicAppUrl } from "@/lib/app-url";
import { createPortalTrackingToken, hasPortalTrackingConfig } from "@/lib/portal-tracking";

export function portalHomeUrl() {
  return `${getPublicAppUrl()}/portal`;
}

export function buildPortalTrackUrl(input: {
  reference?: string | null;
  email?: string | null;
  companyId?: string | null;
  feedback?: boolean;
}) {
  const reference = input.reference?.trim().toUpperCase() || "";
  const home = portalHomeUrl();
  if (!reference) {
    return { url: home, smsSafeUrl: home, hasToken: false, reference: "" };
  }

  const params = new URLSearchParams({ ref: reference });
  const smsParams = new URLSearchParams({ ref: reference });
  const email = input.email?.trim().toLowerCase() || "";
  const companyId = input.companyId?.trim() || "";
  let hasToken = false;

  if (email.includes("@") && companyId && hasPortalTrackingConfig()) {
    params.set("token", createPortalTrackingToken({ reference, email, companyId }));
    hasToken = true;
  }
  if (input.feedback) {
    params.set("feedback", "1");
    smsParams.set("feedback", "1");
  }

  return {
    url: `${home}?${params.toString()}`,
    smsSafeUrl: `${home}?${smsParams.toString()}`,
    hasToken,
    reference,
  };
}
