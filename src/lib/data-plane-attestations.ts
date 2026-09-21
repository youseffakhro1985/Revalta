import attestations from "./data-plane-attestations.json";

export const PRODUCTION_DATA_PLANE_ID = attestations.production;
export const PREVIEW_DATA_PLANE_ID = attestations.preview;

if (PRODUCTION_DATA_PLANE_ID === PREVIEW_DATA_PLANE_ID) {
  throw new Error("Release data-plane attestations must keep Preview isolated from Production");
}

if (!/^[a-f0-9]{64}$/.test(PRODUCTION_DATA_PLANE_ID) || !/^[a-f0-9]{64}$/.test(PREVIEW_DATA_PLANE_ID)) {
  throw new Error("Release data-plane attestations must be 64-character hex digests");
}
