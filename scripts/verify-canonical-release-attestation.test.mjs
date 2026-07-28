import { describe, expect, it } from "vitest";
import {
  serializeCanonicalJson,
  verifyCanonicalAttestationBytes,
} from "./verify-canonical-release-attestation.mjs";

const SAMPLE = {
  schemaVersion: 6,
  kind: "revalta.release-boundary-attestation",
  verdict: "passed",
};

function bytes(value) {
  return Buffer.from(value, "utf8");
}

describe("canonical release attestation bytes", () => {
  it("accepts only the deterministic Revalta JSON representation", () => {
    const canonical = serializeCanonicalJson(SAMPLE);
    expect(verifyCanonicalAttestationBytes(bytes(canonical))).toEqual(SAMPLE);
  });

  it("rejects duplicate JSON keys even when JSON.parse would accept them", () => {
    const duplicate = `{
  "schemaVersion": 5,
  "schemaVersion": 6,
  "kind": "revalta.release-boundary-attestation",
  "verdict": "passed"
}\n`;
    expect(JSON.parse(duplicate).schemaVersion).toBe(6);
    expect(() => verifyCanonicalAttestationBytes(bytes(duplicate))).toThrow("canonical JSON bytes");
  });

  it("rejects alternate key order and whitespace", () => {
    const reordered = `{
  "kind": "revalta.release-boundary-attestation",
  "schemaVersion": 6,
  "verdict": "passed"
}\n`;
    const compact = JSON.stringify(SAMPLE);
    const extraNewline = `${serializeCanonicalJson(SAMPLE)}\n`;
    expect(() => verifyCanonicalAttestationBytes(bytes(reordered))).toThrow("canonical JSON bytes");
    expect(() => verifyCanonicalAttestationBytes(bytes(compact))).toThrow("canonical JSON bytes");
    expect(() => verifyCanonicalAttestationBytes(bytes(extraNewline))).toThrow("canonical JSON bytes");
  });

  it("rejects a UTF-8 BOM and invalid UTF-8", () => {
    const canonical = bytes(serializeCanonicalJson(SAMPLE));
    const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), canonical]);
    const invalidUtf8 = Buffer.from([0xc3, 0x28]);
    expect(() => verifyCanonicalAttestationBytes(bom)).toThrow("UTF-8 BOM");
    expect(() => verifyCanonicalAttestationBytes(invalidUtf8)).toThrow("valid UTF-8");
  });

  it("rejects empty and oversized artifacts", () => {
    expect(() => verifyCanonicalAttestationBytes(Buffer.alloc(0))).toThrow("must not be empty");
    expect(() => verifyCanonicalAttestationBytes(bytes(serializeCanonicalJson(SAMPLE)), { maxBytes: 8 })).toThrow("exceeds 8 byte");
    expect(() => verifyCanonicalAttestationBytes(bytes(serializeCanonicalJson(SAMPLE)), { maxBytes: 0 })).toThrow("positive integer");
  });
});
