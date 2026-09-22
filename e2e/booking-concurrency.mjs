import {
  validateBookingCreated,
  validateBookingOverlapRejected,
} from "./booking-concurrency-contract.mjs";

async function api(page, method, path, body) {
  return page.evaluate(async ({ method, path, body }) => {
    const response = await fetch(path, {
      method,
      credentials: "same-origin",
      redirect: "manual",
      headers: body === undefined
        ? { Accept: "application/json" }
        : { Accept: "application/json", "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) {
      return { status: response.status || 0, body: null };
    }
    let json = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }
    return { status: response.status, body: json };
  }, { method, path, body });
}

function isoAt(dayKey, hour, minute = 0) {
  const day = 1 + (Number.parseInt(dayKey, 10) % 27);
  const month = 1 + (Number.parseInt(dayKey, 10) % 11);
  return new Date(Date.UTC(2027, month - 1, day, hour, minute, 0)).toISOString();
}

/**
 * Staff booking overlap on Preview: first create persists, overlapping
 * create is 409 without a second row, a later non-overlapping slot persists.
 */
export async function runStaffBookingOverlap({ page, runId, propertyId }) {
  const suffix = runId.slice(-6);
  const dayKey = suffix.replace(/\D/g, "") || "1";
  const resource = `E2E Tvätt ${suffix}`;
  const payload = {
    propertyId,
    resource,
    residentName: `E2E Boende ${suffix}`,
    unit: "1201",
  };

  const first = await api(page, "POST", "/api/bookings", {
    ...payload,
    start: isoAt(dayKey, 10),
    end: isoAt(dayKey, 11),
  });
  validateBookingCreated(first.status, first.body);

  const overlap = await api(page, "POST", "/api/bookings", {
    ...payload,
    start: isoAt(dayKey, 10, 30),
    end: isoAt(dayKey, 11, 30),
  });
  validateBookingOverlapRejected(overlap.status, overlap.body);

  const later = await api(page, "POST", "/api/bookings", {
    ...payload,
    start: isoAt(dayKey, 14),
    end: isoAt(dayKey, 15),
  });
  validateBookingCreated(later.status, later.body);
}
