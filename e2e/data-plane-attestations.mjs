import { readFileSync } from "node:fs";

const attestations = JSON.parse(
  readFileSync(new URL("../src/lib/data-plane-attestations.json", import.meta.url), "utf8"),
);

export const PRODUCTION_DATA_PLANE_ID = String(attestations.production || "");
export const PREVIEW_DATA_PLANE_ID = String(attestations.preview || "");

if (!/^[a-f0-9]{64}$/.test(PRODUCTION_DATA_PLANE_ID) || !/^[a-f0-9]{64}$/.test(PREVIEW_DATA_PLANE_ID)) {
  throw new Error("Release data-plane attestations must be 64-character hex digests");
}

if (PRODUCTION_DATA_PLANE_ID === PREVIEW_DATA_PLANE_ID) {
  throw new Error("Release data-plane attestations must keep Preview isolated from Production");
}
