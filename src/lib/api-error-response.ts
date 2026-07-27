import { NextResponse } from "next/server";
import { REQUEST_ID_HEADER } from "@/lib/request-correlation";

export const API_ERROR_CODES = {
  forbidden: "FORBIDDEN",
  untrustedMutation: "UNTRUSTED_MUTATION",
  residentPortalOnly: "RESIDENT_PORTAL_ONLY",
  unauthorized: "UNAUTHORIZED",
  validationFailed: "VALIDATION_FAILED",
  notFound: "NOT_FOUND",
  conflict: "CONFLICT",
  rateLimited: "RATE_LIMITED",
  internalError: "INTERNAL_ERROR",
  serviceUnavailable: "SERVICE_UNAVAILABLE",
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

type ApiErrorResponseOptions = {
  status: number;
  code: ApiErrorCode;
  message: string;
  requestId: string;
  headers?: HeadersInit;
};

export function apiErrorResponse({
  status,
  code,
  message,
  requestId,
  headers,
}: ApiErrorResponseOptions) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  responseHeaders.set("CDN-Cache-Control", "no-store");
  responseHeaders.set("Vercel-CDN-Cache-Control", "no-store");
  responseHeaders.set("X-Content-Type-Options", "nosniff");
  responseHeaders.set(REQUEST_ID_HEADER, requestId);

  return NextResponse.json(
    {
      error: message,
      errorCode: code,
      requestId,
    },
    {
      status,
      headers: responseHeaders,
    },
  );
}
