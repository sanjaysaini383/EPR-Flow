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
