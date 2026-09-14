import { headers } from "next/headers";
import { getClientIp } from "@/lib/rate-limit";
import { loadPublicTrackedTicket, type PublicTrackedTicket } from "@/lib/public-ticket-track";

export type PortalSearchParams = {
  created?: string;
  commented?: string;
  attached?: string;
  ref?: string;
  reason?: string;
  token?: string;
  email?: string;
};

export async function loadPortalTrackedTicket(params: PortalSearchParams) {
  const reference = params.ref?.trim() || "";
  const token = params.token?.trim() || "";
  const email = params.email?.trim() || "";
  if (!reference || (!token && !email.includes("@"))) {
    return { ticket: null as PublicTrackedTicket | null, trackingToken: token, error: "" };
  }

  const headerStore = await headers();
  const request = new Request("https://www.revalta.se/portal", { headers: headerStore });
  const result = await loadPublicTrackedTicket({
    reference,
    email,
    token,
    ip: getClientIp(request),
  });
  if (!result.ok) {
    return { ticket: null as PublicTrackedTicket | null, trackingToken: token, error: result.error };
  }
  return { ticket: result.ticket, trackingToken: result.trackingToken, error: "" };
}
