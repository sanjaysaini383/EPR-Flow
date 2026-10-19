import { stateFromGstCode, type StateCode } from "./states";

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function normalizeGstin(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

/** Mod-36 check digit used by GSTN (last character of a GSTIN). */
export function gstinCheckDigit(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const value = CHARSET.indexOf(first14[i]);
    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARSET[(36 - (sum % 36)) % 36];
}

export type GstinValidation =
  | { valid: true; gstin: string; stateCode: StateCode; pan: string }
  | { valid: false; reason: string };

export function validateGstin(raw: string): GstinValidation {
  const gstin = normalizeGstin(raw);
  if (gstin.length !== 15) return { valid: false, reason: "GSTIN must be 15 characters" };
  if (!GSTIN_PATTERN.test(gstin)) return { valid: false, reason: "GSTIN format is invalid" };

  const stateCode = stateFromGstCode(gstin.slice(0, 2));
  if (!stateCode) return { valid: false, reason: "GSTIN has an unknown state code" };

  if (gstinCheckDigit(gstin.slice(0, 14)) !== gstin[14]) {
    return { valid: false, reason: "GSTIN checksum does not match" };
  }
  return { valid: true, gstin, stateCode, pan: gstin.slice(2, 12) };
}
