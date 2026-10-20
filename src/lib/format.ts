const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const inrCompact = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", notation: "compact", maximumFractionDigits: 1 });

export function formatInr(value: number | string): string {
  return inr.format(Number(value));
}

/** ₹12.4L, ₹1.2Cr — for tiles where space is tight. */
export function formatInrCompact(value: number | string): string {
  return inrCompact.format(Number(value));
}

export function formatPercent(value: number | null, digits = 0): string {
  return value === null ? "—" : `${(value * 100).toFixed(digits)}%`;
}
