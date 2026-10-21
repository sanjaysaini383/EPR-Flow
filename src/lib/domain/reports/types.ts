/**
 * Format-neutral report model. Builders produce a ReportDocument from plain data;
 * renderers (Excel, PDF, CSV) turn it into a file. Quantities are carried in kg and
 * shown in tonnes, so every format shows the same rounded numbers.
 */

export type ColumnKind = "text" | "tonnes" | "percent" | "inr" | "date" | "number";

export type ReportColumn = { key: string; label: string; kind: ColumnKind; width?: number };

/** Cell values: tonnes columns hold kg; percent columns hold 0–100; dates are Date objects. */
export type CellValue = string | number | Date | null;

export type ReportSection = {
  title: string;
  note?: string;
  columns: ReportColumn[];
  rows: Record<string, CellValue>[];
  /** Optional totals row, keyed like the rows. */
  totals?: Record<string, CellValue>;
  /** Key–value sections (entity details) are rendered as two columns. */
  layout?: "table" | "fields";
};

export type ReportDocument = {
  title: string;
  subtitle: string;
  organizationName: string;
  generatedAt: Date;
  sections: ReportSection[];
  disclaimer?: string;
};

const tonnesFormat = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const inrFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const numberFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const dateFormat = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

/**
 * Formats a cell as text. `currency` is "Rs." for PDF (the built-in PDF fonts have no
 * rupee glyph) and "₹" elsewhere.
 */
export function formatCell(value: CellValue | undefined, kind: ColumnKind, currency = "₹"): string {
  if (value === null || value === undefined || value === "") return "—";
  if (value instanceof Date) return dateFormat.format(value);
  if (typeof value === "string") return value;
  switch (kind) {
    case "tonnes":
      return tonnesFormat.format(value / 1000);
    case "percent":
      return `${numberFormat.format(value)}%`;
    case "inr":
      return `${currency} ${inrFormat.format(value)}`;
    default:
      return numberFormat.format(value);
  }
}
