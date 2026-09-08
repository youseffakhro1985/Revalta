// Non-secret release attestations for the PostgreSQL data planes used by the
// exact-SHA Preview gate. These SHA-256 values are derived from a normalized
// host/port/database target and intentionally contain no credentials or query
// parameters. Updating either datastore requires an explicit reviewed change
// to this file so Preview isolation cannot be silently redirected.

export const PRODUCTION_DATA_PLANE_ID = "e51d9599fa4b3c03898d33a44d3fb5973987e8fd3569896aa3c005fc5673ba2a";
export const PREVIEW_DATA_PLANE_ID = "2eb0d0064180411ff1a387ae263f65bffb286f72a903c79cc7eb23a729a8abdd";

if (PRODUCTION_DATA_PLANE_ID === PREVIEW_DATA_PLANE_ID) {
  throw new Error("Release data-plane attestations must keep Preview isolated from Production");
}
