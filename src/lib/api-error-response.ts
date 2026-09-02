import { NextResponse } from "next/server";
import { normalizeRequestId, REQUEST_ID_HEADER } from "@/lib/request-correlation";

export const API_ERROR_CODES = {
  forbidden: "FORBIDDEN",
  untrustedMutation: "UNTRUSTED_MUTATION",
  residentPortalOnly: "RESIDENT_PORTAL_ONLY",
  unauthorized: "UNAUTHORIZED",
  emailVerificationRequired: "EMAIL_VERIFICATION_REQUIRED",
  validationFailed: "VALIDATION_FAILED",
  notFound: "NOT_FOUND",
  conflict: "CONFLICT",
  rateLimited: "RATE_LIMITED",
  payloadTooLarge: "PAYLOAD_TOO_LARGE",
  internalError: "INTERNAL_ERROR",
  serviceUnavailable: "SERVICE_UNAVAILABLE",
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

const SAFE_EXTRA_HEADERS = new Set(["allow", "retry-after", "www-authenticate"]);
const MAX_PUBLIC_ERROR_MESSAGE_LENGTH = 500;

type ApiErrorResponseOptions = {
  status: number;
  code: ApiErrorCode;
  message: string;
  requestId: string;
  headers?: HeadersInit;
};

function assertErrorStatus(status: number) {
  if (!Number.isInteger(status) || status < 400 || status > 599) {
    throw new RangeError(`API error responses require an integer HTTP status between 400 and 599; received ${status}`);
  }
}

function normalizePublicMessage(message: string) {
  const normalized = message.trim();
  if (!normalized) {
    throw new Error("API error responses require a non-empty public message");
  }
  if (normalized.length > MAX_PUBLIC_ERROR_MESSAGE_LENGTH) {
    throw new Error(`API error message exceeds ${MAX_PUBLIC_ERROR_MESSAGE_LENGTH} characters`);
  }
  return normalized;
}

function safeExtraHeaders(headers?: HeadersInit) {
  const safe = new Headers();
  if (!headers) return safe;

  for (const [name, value] of new Headers(headers)) {
    if (SAFE_EXTRA_HEADERS.has(name.toLowerCase())) {
      safe.set(name, value);
    }
  }
  return safe;
}

export function apiErrorResponse({
  status,
  code,
  message,
  requestId,
  headers,
}: ApiErrorResponseOptions) {
  assertErrorStatus(status);
  const safeRequestId = normalizeRequestId(requestId);
  const publicMessage = normalizePublicMessage(message);
  const responseHeaders = safeExtraHeaders(headers);
  responseHeaders.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  responseHeaders.set("CDN-Cache-Control", "no-store");
  responseHeaders.set("Vercel-CDN-Cache-Control", "no-store");
  responseHeaders.set("X-Content-Type-Options", "nosniff");
  responseHeaders.set(REQUEST_ID_HEADER, safeRequestId);

  return NextResponse.json(
    {
      error: publicMessage,
      errorCode: code,
      requestId: safeRequestId,
    },
    {
      status,
      headers: responseHeaders,
    },
  );
}
