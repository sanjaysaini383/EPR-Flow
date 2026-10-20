import { describe, expect, it } from "vitest";
import {
  financialYearOf,
  financialYearProgress,
  isFinancialYear,
  parseFinancialYear,
  recentFinancialYears,
  checkReportingMonth,
  parseMonth,
} from "../financial-year";
import { formatTonnes, parseNumber, parseUnit, toKg } from "../units";

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


describe("parseMonth", () => {
  it.each([
    ["2025-07", "2025-07-01"],
    ["2025/7/15", "2025-07-01"],
    ["07/2025", "2025-07-01"],
    ["Jul 2025", "2025-07-01"],
    ["July-25", "2025-07-01"],
    ["sept 2025", "2025-09-01"],
    [45839, "2025-07-01"], // Excel serial for 2025-07-01
  ])("parses %s", (input, expected) => {
    expect(parseMonth(input)?.toISOString().slice(0, 10)).toBe(expected);
  });

  it.each(["2025-13", "Jule 2025", "hello", "", 12])("rejects %s", (input) => {
    expect(parseMonth(input)).toBeNull();
  });

  it("rejects future months and months before EPR began", () => {
    const today = new Date("2026-10-20T00:00:00Z");
    expect(checkReportingMonth(new Date("2026-10-01T00:00:00Z"), today)).toBeNull();
    expect(checkReportingMonth(new Date("2026-11-01T00:00:00Z"), today)).toBe("Month cannot be in the future");
    expect(checkReportingMonth(new Date("2015-01-01T00:00:00Z"), today)).toMatch(/before April 2016/);
  });
});

describe("units", () => {
  it("parses numbers strictly", () => {
    expect(parseNumber("1,25,000.5")).toBe(125000.5);
    expect(parseNumber("1e5")).toBeNull();
    expect(parseNumber("₹100")).toBeNull();
    expect(parseNumber("-3")).toBeNull();
  });

  it("converts units and avoids float noise", () => {
    expect(parseUnit("MT")).toBe("tonne");
    expect(parseUnit("")).toBe("kg");
    expect(parseUnit("lbs")).toBeNull();
    expect(toKg(0.1 + 0.2, "kg")).toBe(0.3);
    expect(toKg(1.2345, "tonne")).toBe(1234.5);
    expect(formatTonnes(1234567)).toBe("1,234.567 t");
  });
});
