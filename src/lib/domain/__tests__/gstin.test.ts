import { describe, expect, it } from "vitest";
import { gstinCheckDigit, validateGstin } from "../gstin";

const withChecksum = (first14: string) => first14 + gstinCheckDigit(first14);

describe("validateGstin", () => {
  it("accepts a well-formed GSTIN and derives state + PAN", () => {
    const gstin = withChecksum("27AAACD1234F1Z");
    expect(validateGstin(gstin)).toEqual({ valid: true, gstin, stateCode: "MH", pan: "AAACD1234F" });
  });

  it("normalises case and whitespace", () => {
    const gstin = withChecksum("29AAACD1234F1Z");
    const result = validateGstin(` ${gstin.toLowerCase()} `);
    expect(result).toMatchObject({ valid: true, gstin, stateCode: "KA" });
  });

  it("rejects a wrong checksum", () => {
    const gstin = withChecksum("27AAACD1234F1Z");
    const wrong = gstin.slice(0, 14) + (gstin[14] === "A" ? "B" : "A");
    expect(validateGstin(wrong)).toEqual({ valid: false, reason: "GSTIN checksum does not match" });
  });

  it("rejects bad length, format and unknown state codes", () => {
    expect(validateGstin("27AAACD1234F1Z")).toMatchObject({ valid: false });
    expect(validateGstin("27AAACD1234F1X1")).toMatchObject({ valid: false, reason: "GSTIN format is invalid" });
    expect(validateGstin(withChecksum("99AAACD1234F1Z"))).toMatchObject({
      valid: false,
      reason: "GSTIN has an unknown state code",
    });
  });

  it("matches a known real-world checksum", () => {
    // Publicly listed GSTIN format example used in GSTN documentation.
    expect(gstinCheckDigit("27AAPFU0939F1Z")).toBe("V");
  });
});
