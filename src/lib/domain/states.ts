/**
 * Indian states and union territories.
 * `code` is the ISO 3166-2:IN suffix stored in the DB; `gstCode` is the
 * two-digit GST state code (first two characters of a GSTIN).
 */
export const INDIAN_STATES = [
  { code: "AN", gstCode: "35", name: "Andaman and Nicobar Islands" },
  { code: "AP", gstCode: "37", name: "Andhra Pradesh" },
  { code: "AR", gstCode: "12", name: "Arunachal Pradesh" },
  { code: "AS", gstCode: "18", name: "Assam" },
  { code: "BR", gstCode: "10", name: "Bihar" },
  { code: "CH", gstCode: "04", name: "Chandigarh" },
  { code: "CT", gstCode: "22", name: "Chhattisgarh" },
  { code: "DH", gstCode: "26", name: "Dadra and Nagar Haveli and Daman and Diu" },
  { code: "DL", gstCode: "07", name: "Delhi" },
  { code: "GA", gstCode: "30", name: "Goa" },
  { code: "GJ", gstCode: "24", name: "Gujarat" },
  { code: "HR", gstCode: "06", name: "Haryana" },
  { code: "HP", gstCode: "02", name: "Himachal Pradesh" },
  { code: "JK", gstCode: "01", name: "Jammu and Kashmir" },
  { code: "JH", gstCode: "20", name: "Jharkhand" },
  { code: "KA", gstCode: "29", name: "Karnataka" },
  { code: "KL", gstCode: "32", name: "Kerala" },
  { code: "LA", gstCode: "38", name: "Ladakh" },
  { code: "LD", gstCode: "31", name: "Lakshadweep" },
  { code: "MP", gstCode: "23", name: "Madhya Pradesh" },
  { code: "MH", gstCode: "27", name: "Maharashtra" },
  { code: "MN", gstCode: "14", name: "Manipur" },
  { code: "ML", gstCode: "17", name: "Meghalaya" },
  { code: "MZ", gstCode: "15", name: "Mizoram" },
  { code: "NL", gstCode: "13", name: "Nagaland" },
  { code: "OR", gstCode: "21", name: "Odisha" },
  { code: "PY", gstCode: "34", name: "Puducherry" },
  { code: "PB", gstCode: "03", name: "Punjab" },
  { code: "RJ", gstCode: "08", name: "Rajasthan" },
  { code: "SK", gstCode: "11", name: "Sikkim" },
  { code: "TN", gstCode: "33", name: "Tamil Nadu" },
  { code: "TG", gstCode: "36", name: "Telangana" },
  { code: "TR", gstCode: "16", name: "Tripura" },
  { code: "UP", gstCode: "09", name: "Uttar Pradesh" },
  { code: "UT", gstCode: "05", name: "Uttarakhand" },
  { code: "WB", gstCode: "19", name: "West Bengal" },
] as const;

export type StateCode = (typeof INDIAN_STATES)[number]["code"];

export const STATE_CODES = INDIAN_STATES.map((s) => s.code) as [StateCode, ...StateCode[]];

export function isStateCode(value: string): value is StateCode {
  return INDIAN_STATES.some((s) => s.code === value);
}

export function stateName(code: string): string {
  return INDIAN_STATES.find((s) => s.code === code)?.name ?? code;
}

export function stateFromGstCode(gstCode: string): StateCode | null {
  return INDIAN_STATES.find((s) => s.gstCode === gstCode)?.code ?? null;
}
