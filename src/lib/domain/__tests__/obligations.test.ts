import { describe, expect, it } from "vitest";
import { buildAlerts } from "../obligations/alerts";
import { calculateCompliance, statusFor, type CertificateRow, type QuantityRow } from "../obligations/calculate";
import { resolveRule, type Rule } from "../rules/resolve";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

const CAT_I = { id: "c1", code: "PLASTIC_CAT_I", name: "Category I – Rigid plastic packaging", stream: "PLASTIC", sortOrder: 0 };
const CAT_II = { id: "c2", code: "PLASTIC_CAT_II", name: "Category II – Flexible plastic packaging", stream: "PLASTIC", sortOrder: 1 };

let seq = 0;
const rule = (over: Partial<Rule>): Rule => ({
  id: `r${++seq}`,
  stream: "PLASTIC",
  categoryId: null,
  entityType: null,
  ruleType: "EPR_TARGET",
  financialYear: null,
  value: 100,
  unit: "PERCENT",
  parameters: { baseMethod: "AVERAGE_PREVIOUS_YEARS", lookbackYears: 2, deductPreConsumer: true },
  effectiveFrom: d("2024-04-01"),
  effectiveTo: null,
  version: 1,
  isVerified: true,
  ...over,
});

const RULES: Rule[] = [
  rule({ id: "epr" }),
  rule({ id: "rec-1", ruleType: "RECYCLING_TARGET", categoryId: "c1", financialYear: "2026-27", value: 70, parameters: null }),
  rule({ id: "rec-2", ruleType: "RECYCLING_TARGET", categoryId: "c2", financialYear: "2026-27", value: 50, parameters: null }),
  rule({ id: "rc-1", ruleType: "RECYCLED_CONTENT", categoryId: "c1", financialYear: "2026-27", value: 40, parameters: null }),
  rule({ id: "ec-1", ruleType: "EC_RATE", categoryId: "c1", value: 5, unit: "INR_PER_KG", parameters: null }),
  rule({ id: "ec-2", ruleType: "EC_RATE", categoryId: "c2", value: 10, unit: "INR_PER_KG", parameters: null }),
];

const qty = (over: Partial<QuantityRow>): QuantityRow => ({
  financialYear: "2025-26",
  categoryId: "c1",
  entityType: "BRAND_OWNER",
  stateCode: "MH",
  quantityKg: 1000,
  recycledContentKg: null,
  isPreConsumer: false,
  ...over,
});
const cert = (over: Partial<CertificateRow>): CertificateRow => ({
  financialYear: "2026-27",
  categoryId: "c1",
  type: "RECYCLING",
  quantityKg: 100,
  costInr: 1000,
  ...over,
});

describe("resolveRule", () => {
  const q = { ruleType: "EPR_TARGET", stream: "PLASTIC", categoryId: "c1", entityType: "PRODUCER", financialYear: "2026-27" };

  it("prefers the most specific rule, then the highest version", () => {
    const rules = [
      rule({ id: "stream-wide", value: 100 }),
      rule({ id: "cat", categoryId: "c1", value: 90 }),
      rule({ id: "cat-entity", categoryId: "c1", entityType: "PRODUCER", value: 80 }),
      rule({ id: "cat-entity-v2", categoryId: "c1", entityType: "PRODUCER", value: 75, version: 2 }),
    ];
    expect(resolveRule(rules, q)?.id).toBe("cat-entity-v2");
    expect(resolveRule(rules.slice(0, 2), q)?.id).toBe("cat");
    expect(resolveRule(rules.slice(0, 2), { ...q, categoryId: "c2" })?.id).toBe("stream-wide");
  });

  it("respects financial-year rules and effective date ranges", () => {
    const rules = [
      rule({ id: "fy25", financialYear: "2025-26" }),
      rule({ id: "old", effectiveFrom: d("2020-04-01"), effectiveTo: d("2024-04-01") }),
    ];
    expect(resolveRule(rules, { ...q, financialYear: "2025-26" })?.id).toBe("fy25");
    expect(resolveRule(rules, { ...q, financialYear: "2023-24" })?.id).toBe("old");
    expect(resolveRule(rules, { ...q, financialYear: "2026-27" })).toBeNull();
  });

  it("never matches another stream or rule type", () => {
    expect(resolveRule([rule({ stream: "EWASTE" })], q)).toBeNull();
    expect(resolveRule([rule({ ruleType: "EC_RATE" })], q)).toBeNull();
  });
});

describe("calculateCompliance", () => {
  const today = d("2026-10-01"); // half-way through FY 2026-27
  const base = [
    qty({ financialYear: "2024-25", quantityKg: 8000 }),
    qty({ financialYear: "2025-26", quantityKg: 12000 }),
    qty({ financialYear: "2025-26", quantityKg: 4000, isPreConsumer: true }), // deducted
    qty({ financialYear: "2026-27", quantityKg: 5000, recycledContentKg: 1500 }),
  ];

  it("computes base, targets, recycling split and recycled content", () => {
    const r = calculateCompliance({ financialYear: "2026-27", categories: [CAT_I], quantities: base, certificates: [], rules: RULES, today });
    const line = r.lines[0];
    expect(line.baseYears).toEqual(["2024-25", "2025-26"]);
    expect(line.baseQuantityKg).toBe(10000); // (8000 + 12000) / 2
    expect(line.targetKg).toBe(10000);
    expect(line.recyclingTargetKg).toBe(7000);
    expect(line.currentYearKg).toBe(5000);
    expect(line.recycledContentRequiredKg).toBe(2000); // 40% of 5000
    expect(line.recycledContentActualKg).toBe(1500);
    expect(line.rules.map((x) => x.id).sort()).toEqual(["ec-1", "epr", "rc-1", "rec-1"]);
  });

  it("counts end-of-life certificates only toward the non-recycling part", () => {
    const r = calculateCompliance({
      financialYear: "2026-27",
      categories: [CAT_I],
      quantities: base,
      certificates: [cert({ quantityKg: 4000 }), cert({ type: "END_OF_LIFE", quantityKg: 5000 })],
      rules: RULES,
      today,
    });
    const line = r.lines[0];
    expect(line.fulfilledKg).toBe(7000); // 4000 recycling + min(5000, 10000 − 7000)
    expect(line.shortfallKg).toBe(3000);
    expect(line.recyclingShortfallKg).toBe(3000);
    expect(line.estimatedEcInr).toBe(15000); // 3000 kg × ₹5
  });

  it("assigns status from progress versus the share of the year elapsed", () => {
    const run = (kg: number) =>
      calculateCompliance({ financialYear: "2026-27", categories: [CAT_I], quantities: base, certificates: [cert({ quantityKg: kg })], rules: RULES, today })
        .lines[0].status;
    expect(run(10000)).toBe("MET");
    expect(run(4500)).toBe("ON_TRACK"); // 45% vs ~50% elapsed
    expect(run(3000)).toBe("BEHIND");
    expect(run(500)).toBe("AT_RISK");
  });

  it("reports a shortfall once the year is over", () => {
    expect(statusFor(0.8, 1, true, true)).toBe("SHORTFALL");
    expect(statusFor(null, 0.5, false, false)).toBe("NO_OBLIGATION");
  });

  it("supports CURRENT_YEAR base and disabling the pre-consumer deduction", () => {
    const rules = [rule({ id: "epr-cy", parameters: { baseMethod: "CURRENT_YEAR", deductPreConsumer: false }, value: 50 })];
    const r = calculateCompliance({
      financialYear: "2026-27",
      categories: [CAT_I],
      quantities: [qty({ financialYear: "2026-27", quantityKg: 3000 }), qty({ financialYear: "2026-27", quantityKg: 1000, isPreConsumer: true })],
      certificates: [],
      rules,
      today,
    });
    expect(r.lines[0].baseQuantityKg).toBe(4000);
    expect(r.lines[0].targetKg).toBe(2000);
  });

  it("flags categories without a rule and summarises totals, score and unverified rules", () => {
    const rules = [rule({ id: "epr-c1", categoryId: "c1", isVerified: false })];
    const r = calculateCompliance({
      financialYear: "2026-27",
      categories: [CAT_I, CAT_II],
      quantities: [...base, qty({ categoryId: "c2", financialYear: "2025-26", quantityKg: 2000 })],
      certificates: [cert({ quantityKg: 12000, costInr: 50000 })],
      rules,
      today,
    });
    expect(r.lines.map((l) => l.status)).toEqual(["MET", "NO_RULE"]);
    expect(r.score).toBe(1); // over-fulfilment is capped at 100%
    expect(r.totals.certificateSpendInr).toBe(50000);
    expect(r.unverifiedRules.map((x) => x.id)).toEqual(["epr-c1"]);
  });

  it("ignores categories with no recent activity", () => {
    const r = calculateCompliance({
      financialYear: "2026-27",
      categories: [CAT_I, CAT_II],
      quantities: [qty({ financialYear: "2019-20", categoryId: "c2" })],
      certificates: [],
      rules: RULES,
      today,
    });
    expect(r.lines).toEqual([]);
    expect(r.score).toBeNull();
  });
});

describe("buildAlerts", () => {
  it("writes the 'behind with N months left' alert with stable dedupe keys", () => {
    const r = calculateCompliance({
      financialYear: "2026-27",
      categories: [CAT_II],
      quantities: [qty({ categoryId: "c2", financialYear: "2025-26", quantityKg: 20000 })],
      certificates: [cert({ categoryId: "c2", quantityKg: 2000 })],
      rules: [...RULES.slice(0, 1).map((x) => ({ ...x, isVerified: false })), ...RULES.slice(1)],
      today: d("2027-01-01"),
    });
    const alerts = buildAlerts(r, d("2027-01-01"));
    expect(alerts[0]).toMatchObject({
      dedupeKey: "behind:2026-27:PLASTIC_CAT_II",
      severity: "CRITICAL",
      title: "You are 55% behind on Cat II target with 3 months left", // 20% fulfilled vs 75% of FY elapsed
    });
    expect(alerts.at(-1)?.dedupeKey).toBe("unverified-rules:2026-27");
    expect(buildAlerts(r, d("2027-01-01")).map((a) => a.dedupeKey)).toEqual(alerts.map((a) => a.dedupeKey));
  });

  it("warns about recycled content in the second half of the year", () => {
    const r = calculateCompliance({
      financialYear: "2026-27",
      categories: [CAT_I],
      quantities: [qty({ financialYear: "2026-27", quantityKg: 10000, recycledContentKg: 1000 })],
      certificates: [],
      rules: RULES,
      today: d("2026-11-01"),
    });
    expect(buildAlerts(r, d("2026-11-01")).map((a) => a.dedupeKey)).toContain("recycled-content:2026-27:PLASTIC_CAT_I");
  });
});
