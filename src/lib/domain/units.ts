/** Quantities are stored in kilograms with up to 3 decimals; the UI also shows tonnes. */

export const MAX_QUANTITY_KG = 1_000_000_000; // 1 million tonnes per row — anything larger is a typo

export type QuantityUnit = "kg" | "tonne";

const UNIT_ALIASES: Record<string, QuantityUnit> = {
  kg: "kg",
  kgs: "kg",
  kilogram: "kg",
  kilograms: "kg",
  t: "tonne",
  mt: "tonne",
  ton: "tonne",
  tons: "tonne",
  tonne: "tonne",
  tonnes: "tonne",
};

export function parseUnit(raw: unknown): QuantityUnit | null {
  if (raw === undefined || raw === null || String(raw).trim() === "") return "kg";
  return UNIT_ALIASES[String(raw).trim().toLowerCase().replace(/\.$/, "")] ?? null;
}

/**
 * Parses "1,250.5", "1 250", 1250.5 etc. Returns null for anything that is not a plain
 * non-negative decimal number (no scientific notation, currency symbols or text).
 */
export function parseNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const cleaned = raw.trim().replace(/[,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

/** Converts to kg and rounds to grams (3 decimals) to avoid floating-point noise. */
export function toKg(value: number, unit: QuantityUnit): number {
  const kg = unit === "tonne" ? value * 1000 : value;
  return Math.round(kg * 1000) / 1000;
}

/** Decimal string for Prisma (avoids float formatting like 1e21). */
export function kgString(kg: number): string {
  return kg.toFixed(3);
}

const kgFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 });
const tonneFormat = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 3 });

export function formatKg(kg: number | string): string {
  return `${kgFormat.format(Number(kg))} kg`;
}

export function formatTonnes(kg: number | string): string {
  return `${tonneFormat.format(Number(kg) / 1000)} t`;
}
