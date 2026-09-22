function hasId(value) {
  return typeof value === "string" && value.length > 0;
}

export function diagnosticBookingShape(status, body) {
  const redirected = Number.isInteger(status) && ((status >= 300 && status < 400) || status === 0);
  if (redirected) return `${status}:redirect`;
  if (hasId(body?.booking?.id)) return `${status}:created`;
  return `${status}:none`;
}

export function validateBookingCreated(status, body) {
  if (status !== 201 || !hasId(body?.booking?.id)) {
    throw new Error(`Staff booking did not persist (${diagnosticBookingShape(status, body)})`);
  }
  return body.booking.id;
}

export function validateBookingOverlapRejected(status, body) {
  if (status !== 409 || hasId(body?.booking?.id)) {
    throw new Error(`Overlapping staff booking was not rejected (${diagnosticBookingShape(status, body)})`);
  }
}
