import { describe, expect, it } from "vitest";
import {
  financialYearOf,
  financialYearProgress,
  isFinancialYear,
  parseFinancialYear,
  recentFinancialYears,
} from "../financial-year";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("financial year", () => {
  it("starts on 1 April", () => {
    expect(financialYearOf(d("2025-03-31"))).toBe("2024-25");
    expect(financialYearOf(d("2025-04-01"))).toBe("2025-26");
    expect(financialYearOf(d("2025-12-31"))).toBe("2025-26");
  });

  it("handles the century rollover in labels", () => {
    expect(financialYearOf(d("2099-06-01"))).toBe("2099-00");
    expect(isFinancialYear("2099-00")).toBe(true);
  });

  it("parses labels and rejects inconsistent ones", () => {
    expect(parseFinancialYear("2025-26")).toMatchObject({ startYear: 2025, start: d("2025-04-01"), end: d("2026-03-31") });
    expect(isFinancialYear("2025-27")).toBe(false);
    expect(isFinancialYear("FY25")).toBe(false);
  });

  it("computes progress through the year, clamped to 0–1", () => {
    expect(financialYearProgress("2025-26", d("2025-04-01"))).toBe(0);
    expect(financialYearProgress("2025-26", d("2025-10-01"))).toBeCloseTo(0.5, 1);
    expect(financialYearProgress("2025-26", d("2027-01-01"))).toBe(1);
    expect(financialYearProgress("2025-26", d("2024-01-01"))).toBe(0);
  });

  it("lists recent years newest first", () => {
    expect(recentFinancialYears(d("2026-10-19"), 3)).toEqual(["2026-27", "2025-26", "2024-25"]);
  });
});
