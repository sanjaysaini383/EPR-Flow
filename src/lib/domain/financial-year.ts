/**
 * Indian financial year: 1 April – 31 March, labelled "2025-26".
 * All functions use UTC dates so results do not depend on server timezone.
 */

const FY_LABEL = /^(\d{4})-(\d{2})$/;

export function financialYearStartYear(date: Date): number {
  const year = date.getUTCFullYear();
  return date.getUTCMonth() >= 3 ? year : year - 1; // month 3 = April
}

export function financialYearOf(date: Date): string {
  return formatFinancialYear(financialYearStartYear(date));
}

export function formatFinancialYear(startYear: number): string {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

export function parseFinancialYear(label: string): { startYear: number; start: Date; end: Date } {
  const match = FY_LABEL.exec(label);
  if (!match) throw new Error(`Invalid financial year "${label}"`);
  const startYear = Number(match[1]);
  if ((startYear + 1) % 100 !== Number(match[2])) throw new Error(`Invalid financial year "${label}"`);
  return {
    startYear,
    start: new Date(Date.UTC(startYear, 3, 1)),
    end: new Date(Date.UTC(startYear + 1, 2, 31)),
  };
}

export function isFinancialYear(label: string): boolean {
  try {
    parseFinancialYear(label);
    return true;
  } catch {
    return false;
  }
}

/** Fraction (0–1) of the financial year elapsed on `date`. */
export function financialYearProgress(label: string, date: Date): number {
  const { start, startYear } = parseFinancialYear(label);
  const nextStart = Date.UTC(startYear + 1, 3, 1);
  const elapsed = (date.getTime() - start.getTime()) / (nextStart - start.getTime());
  return Math.min(1, Math.max(0, elapsed));
}

/** Most recent `count` financial years ending with the one containing `date`. */
export function recentFinancialYears(date: Date, count: number): string[] {
  const current = financialYearStartYear(date);
  return Array.from({ length: count }, (_, i) => formatFinancialYear(current - i));
}

// ── Months ───────────────────────────────────────────────────────────────

const MONTH_NAMES: Record<string, number> = Object.fromEntries(
  [
    ["jan", "january"],
    ["feb", "february"],
    ["mar", "march"],
    ["apr", "april"],
    ["may", "may"],
    ["jun", "june"],
    ["jul", "july"],
    ["aug", "august"],
    ["sep", "september", "sept"],
    ["oct", "october"],
    ["nov", "november"],
    ["dec", "december"],
  ].flatMap((names, index) => names.map((n) => [n, index] as const)),
);

/** First EPR month we accept: PWM Rules 2016 came into force in FY 2016-17. */
export const EARLIEST_MONTH = new Date(Date.UTC(2016, 3, 1));

function monthDate(year: number, monthIndex: number): Date | null {
  if (!Number.isInteger(year) || year < 1900 || year > 2200 || monthIndex < 0 || monthIndex > 11) return null;
  return new Date(Date.UTC(year, monthIndex, 1));
}

/**
 * Parses a reporting month into the first day of that month (UTC). Accepts
 * "2025-07", "2025-07-15", "07/2025", "7-2025", "Jul 2025", "July-25", JS Dates and
 * Excel date serial numbers. Returns null when the value is not a recognisable month.
 */
export function parseMonth(raw: unknown): Date | null {
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : monthDate(raw.getUTCFullYear(), raw.getUTCMonth());
  }
  if (typeof raw === "number") {
    // Excel serial date (days since 1899-12-30)
    if (raw < 20000 || raw > 80000) return null;
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(raw) * 86_400_000);
    return monthDate(d.getUTCFullYear(), d.getUTCMonth());
  }
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();

  let m = /^(\d{4})[-/.](\d{1,2})(?:[-/.]\d{1,2})?(?:t.*)?$/.exec(v);
  if (m) return monthDate(Number(m[1]), Number(m[2]) - 1);

  m = /^(\d{1,2})[-/.](\d{4})$/.exec(v);
  if (m) return monthDate(Number(m[2]), Number(m[1]) - 1);

  m = /^([a-z]{3,9})[\s\-/.,']*(\d{2}|\d{4})$/.exec(v);
  if (m) {
    const index = MONTH_NAMES[m[1]];
    if (index === undefined) return null;
    const year = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
    return monthDate(year, index);
  }
  return null;
}

/** "2025-07" for a month date. */
export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

/** Validation shared by manual entry and imports. Returns an error message or null. */
export function checkReportingMonth(month: Date, today: Date): string | null {
  if (month < EARLIEST_MONTH) return "Month is before April 2016, when EPR reporting began";
  if (month > startOfMonth(today)) return "Month cannot be in the future";
  return null;
}

const monthFormat = new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });

export function formatMonth(date: Date): string {
  return monthFormat.format(date);
}
