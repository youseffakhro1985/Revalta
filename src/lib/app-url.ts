import { isProductionRuntime } from "@/lib/runtime-env";

const CANONICAL_APP_URL = "https://www.revalta.se";

export function getPublicAppUrl(requestUrl?: string) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const candidate = configured || (isProductionRuntime() ? CANONICAL_APP_URL : requestUrl || CANONICAL_APP_URL);
  const url = new URL(candidate);

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("NEXT_PUBLIC_APP_URL must use HTTP or HTTPS");
  }
  if (isProductionRuntime() && url.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_APP_URL must use HTTPS in production");
  }

  return url.origin;
}
