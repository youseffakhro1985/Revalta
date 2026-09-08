#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const workflow = await readFile(new URL("../.github/workflows/preview-health-attestation.yml", import.meta.url), "utf8");
const attestations = await readFile(new URL("../e2e/data-plane-attestations.mjs", import.meta.url), "utf8");

function requireText(fragment, message) {
  if (!workflow.includes(fragment)) throw new Error(message);
}

requireText("name: Preview Health Attestation", "Preview health workflow name changed unexpectedly");
requireText("deployments: read", "Preview health attestation needs read-only deployment discovery");
requireText("contents: read", "Preview health attestation must keep contents read-only");
requireText("uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1", "Preview health checkout must stay pinned to the verified immutable SHA");
requireText("persist-credentials: false", "Preview health checkout must not persist Git credentials");
requireText("ref: ${{ github.event.pull_request.head.sha }}", "Preview health attestation must check out the exact PR head");
requireText('test "$(git rev-parse HEAD)" = "$EXPECTED_HEAD_SHA"', "Preview health attestation must verify exact checkout identity");
requireText("deployments?sha=${HEAD_SHA}", "Preview health attestation must resolve deployment by exact SHA");
requireText('select(.environment == "Preview" and .sha == $sha)', "Preview health resolver must require the Preview environment and exact SHA");
requireText("/api/health", "Preview health attestation must call the public health endpoint");
requireText("--max-redirs 0", "Preview health attestation must refuse redirects");
requireText("PREVIEW_DATA_PLANE_ID", "Preview health attestation must read the reviewed Preview data-plane identity from source");
requireText('[[ "$health_status" == "ok" ]]', "Preview health attestation must require health status ok");
requireText('[[ "$database" == "ok" ]]', "Preview health attestation must require database status ok");
requireText('[[ "$commit_sha" == "$EXPECTED_SHA" ]]', "Preview health attestation must require exact release SHA");
requireText('[[ "$environment" == "preview" ]]', "Preview health attestation must require Vercel preview environment");
requireText('[[ "$deployment_id_present" == "true" ]]', "Preview health attestation must require deployment identity");
requireText('[[ "$data_plane" == "$expected_data_plane" ]]', "Preview health attestation must require the reviewed isolated data plane");
requireText('[[ "$direct_matches" == "true" ]]', "Preview health attestation must require pooled/direct target agreement");

if (workflow.includes("secrets.")) {
  throw new Error("Preview health attestation must remain credential-free and must not consume GitHub secrets");
}
if (/\bDATABASE_URL\b|\bDIRECT_URL\b/.test(workflow)) {
  throw new Error("Preview health attestation must never receive database connection strings");
}
if (/EXPECTED_DATA_PLANE_ID:\s*[a-f0-9]{64}/.test(workflow)) {
  throw new Error("Preview health attestation must not duplicate the reviewed data-plane hash in YAML");
}
if (!/^export const PREVIEW_DATA_PLANE_ID = "[a-f0-9]{64}";$/m.test(attestations)) {
  throw new Error("Reviewed Preview data-plane attestation is missing or invalid");
}
if (!/^export const PRODUCTION_DATA_PLANE_ID = "[a-f0-9]{64}";$/m.test(attestations)) {
  throw new Error("Reviewed Production data-plane attestation is missing or invalid");
}

console.log("Preview health attestation contract is valid and credential-free.");
