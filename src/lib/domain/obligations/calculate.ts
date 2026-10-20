/**
 * EPR obligation engine. Pure: every regulatory number comes from `rules`, so a change in
 * the CPCB notification is a data change, never a code change.
 *
 * For each material category the organisation deals in, for financial year `fy`:
 *
 *   base       = quantity placed on market, per the EPR_TARGET rule's `baseMethod`:
 *                  AVERAGE_PREVIOUS_YEARS (default) — mean of the previous `lookbackYears` FYs
 *                  CURRENT_YEAR                     — this FY's quantity
 *                pre-consumer quantities are excluded when `deductPreConsumer` is true
 *   target     = base × EPR_TARGET %
 *   recycling  = target × RECYCLING_TARGET %   (the part that must be met by recycling)
 *   fulfilled  = recycling certificates + end-of-life certificates (EoL counts only toward
 *                the non-recycling part of the target)
 *   shortfall  = max(0, target − fulfilled)
 *   EC risk    = shortfall × EC_RATE (INR per kg)
 *   recycled content required = this FY's quantity × RECYCLED_CONTENT %
 */
import { financialYearProgress, formatFinancialYear, parseFinancialYear } from "../financial-year";
import { resolveRule, type Rule } from "../rules/resolve";

export type QuantityRow = {
  financialYear: string;
  categoryId: string;
  entityType: string;
  stateCode: string;
  quantityKg: number;
  recycledContentKg: number | null;
  isPreConsumer: boolean;
};

export type CertificateRow = {
  financialYear: string;
  categoryId: string;
  type: "RECYCLING" | "END_OF_LIFE";
  quantityKg: number;
  costInr: number | null;
};

export type Category = { id: string; code: string; name: string; stream: string; sortOrder: number };

export type ObligationStatus = "NO_RULE" | "NO_OBLIGATION" | "MET" | "ON_TRACK" | "BEHIND" | "AT_RISK" | "SHORTFALL";

export type ObligationLine = {
  category: Category;
  entityTypes: string[];
  baseMethod: string;
  baseYears: string[];
  baseQuantityKg: number;
  currentYearKg: number;
  targetPercent: number | null;
  targetKg: number;
  recyclingPercent: number | null;
  recyclingTargetKg: number;
  fulfilledRecyclingKg: number;
  fulfilledEolKg: number;
  fulfilledKg: number;
  shortfallKg: number;
  recyclingShortfallKg: number;
  ecRateInrPerKg: number | null;
  estimatedEcInr: number;
  recycledContentPercent: number | null;
  recycledContentRequiredKg: number;
  recycledContentActualKg: number;
  progress: number | null; // fulfilled / target, 0–1+
  expectedProgress: number; // share of FY elapsed
  status: ObligationStatus;
  byState: { stateCode: string; baseQuantityKg: number }[];
  rules: Rule[];
};

export type ComplianceResult = {
  financialYear: string;
  fyProgress: number;
  lines: ObligationLine[];
  totals: {
    targetKg: number;
    fulfilledKg: number;
    shortfallKg: number;
    estimatedEcInr: number;
    certificateSpendInr: number;
  };
  /** Share of the total obligation fulfilled (each category capped at 100%); null without obligations. */
  score: number | null;
  unverifiedRules: Rule[];
};

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function previousYears(fy: string, n: number): string[] {
  const { startYear } = parseFinancialYear(fy);
  return Array.from({ length: n }, (_, i) => formatFinancialYear(startYear - n + i));
}

export function statusFor(progress: number | null, expected: number, fyOver: boolean, hasTarget: boolean): ObligationStatus {
  if (!hasTarget || progress === null) return "NO_OBLIGATION";
  if (progress >= 1) return "MET";
  if (fyOver) return "SHORTFALL";
  if (progress >= expected - 0.1) return "ON_TRACK";
  if (progress >= expected - 0.25) return "BEHIND";
  return "AT_RISK";
}

export function calculateCompliance(input: {
  financialYear: string;
  categories: Category[];
  quantities: QuantityRow[];
  certificates: CertificateRow[];
  rules: Rule[];
  today: Date;
}): ComplianceResult {
  const { financialYear: fy, categories, quantities, certificates, rules, today } = input;
  const fyProgress = financialYearProgress(fy, today);
  const fyOver = today > parseFinancialYear(fy).end;

  // Categories with any data in the current or previous 3 years, or certificates this year.
  const relevantYears = new Set([fy, ...previousYears(fy, 3)]);
  const activeCategoryIds = new Set([
    ...quantities.filter((q) => relevantYears.has(q.financialYear)).map((q) => q.categoryId),
    ...certificates.filter((c) => c.financialYear === fy).map((c) => c.categoryId),
  ]);

  const lines: ObligationLine[] = categories
    .filter((c) => activeCategoryIds.has(c.id))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((category) => {
      const rows = quantities.filter((q) => q.categoryId === category.id);
      const entityTypes = [...new Set(rows.map((r) => r.entityType))].sort();
      const usedRules = new Map<string, Rule>();
      const use = (r: Rule | null) => {
        if (r) usedRules.set(r.id, r);
        return r;
      };

      let targetKg = 0;
      let baseQuantityKg = 0;
      let recyclingTargetKg = 0;
      let targetPercent: number | null = null;
      let recyclingPercent: number | null = null;
      let recycledContentPercent: number | null = null;
      let recycledContentRequiredKg = 0;
      let baseMethod = "AVERAGE_PREVIOUS_YEARS";
      let baseYears: string[] = [];
      const stateBase = new Map<string, number>();

      // Obligations are computed per entity type (rules may differ) and summed per category.
      for (const entityType of entityTypes.length ? entityTypes : ["BRAND_OWNER"]) {
        const q = { stream: category.stream, categoryId: category.id, entityType, financialYear: fy };
        const epr = use(resolveRule(rules, { ...q, ruleType: "EPR_TARGET" }));
        if (!epr) continue;

        const params = epr.parameters ?? {};
        baseMethod = params.baseMethod === "CURRENT_YEAR" ? "CURRENT_YEAR" : "AVERAGE_PREVIOUS_YEARS";
        const lookback = Math.max(1, Math.min(5, Number(params.lookbackYears ?? 2) || 2));
        baseYears = baseMethod === "CURRENT_YEAR" ? [fy] : previousYears(fy, lookback);
        const deductPreConsumer = params.deductPreConsumer !== false;

        const baseRows = rows.filter(
          (r) => r.entityType === entityType && baseYears.includes(r.financialYear) && !(deductPreConsumer && r.isPreConsumer),
        );
        const base = sum(baseRows.map((r) => r.quantityKg)) / baseYears.length;
        for (const r of baseRows) stateBase.set(r.stateCode, (stateBase.get(r.stateCode) ?? 0) + r.quantityKg / baseYears.length);

        const t = (base * epr.value) / 100;
        baseQuantityKg += base;
        targetKg += t;
        targetPercent = epr.value;

        const rec = use(resolveRule(rules, { ...q, ruleType: "RECYCLING_TARGET" }));
        if (rec) {
          recyclingTargetKg += (t * rec.value) / 100;
          recyclingPercent = rec.value;
        }

        const rc = use(resolveRule(rules, { ...q, ruleType: "RECYCLED_CONTENT" }));
        if (rc) {
          const current = sum(rows.filter((r) => r.entityType === entityType && r.financialYear === fy).map((r) => r.quantityKg));
          recycledContentRequiredKg += (current * rc.value) / 100;
          recycledContentPercent = rc.value;
        }
      }

      const ec = use(
        resolveRule(rules, { ruleType: "EC_RATE", stream: category.stream, categoryId: category.id, entityType: entityTypes[0] ?? "BRAND_OWNER", financialYear: fy }),
      );

      const certs = certificates.filter((c) => c.categoryId === category.id && c.financialYear === fy);
      const fulfilledRecyclingKg = sum(certs.filter((c) => c.type === "RECYCLING").map((c) => c.quantityKg));
      const fulfilledEolKg = sum(certs.filter((c) => c.type === "END_OF_LIFE").map((c) => c.quantityKg));
      const fulfilledKg = fulfilledRecyclingKg + Math.min(fulfilledEolKg, Math.max(0, targetKg - recyclingTargetKg));
      const shortfallKg = Math.max(0, targetKg - fulfilledKg);
      const ecRate = ec?.value ?? null;

      const currentRows = rows.filter((r) => r.financialYear === fy);
      const progress = targetKg > 0 ? fulfilledKg / targetKg : null;
      const hasRule = usedRules.size > 0 && targetPercent !== null;

      return {
        category,
        entityTypes,
        baseMethod,
        baseYears,
        baseQuantityKg: round3(baseQuantityKg),
        currentYearKg: round3(sum(currentRows.map((r) => r.quantityKg))),
        targetPercent,
        targetKg: round3(targetKg),
        recyclingPercent,
        recyclingTargetKg: round3(recyclingTargetKg),
        fulfilledRecyclingKg: round3(fulfilledRecyclingKg),
        fulfilledEolKg: round3(fulfilledEolKg),
        fulfilledKg: round3(fulfilledKg),
        shortfallKg: round3(shortfallKg),
        recyclingShortfallKg: round3(Math.max(0, recyclingTargetKg - fulfilledRecyclingKg)),
        ecRateInrPerKg: ecRate,
        estimatedEcInr: Math.round(shortfallKg * (ecRate ?? 0)),
        recycledContentPercent,
        recycledContentRequiredKg: round3(recycledContentRequiredKg),
        recycledContentActualKg: round3(sum(currentRows.map((r) => r.recycledContentKg ?? 0))),
        progress,
        expectedProgress: fyProgress,
        status: hasRule ? statusFor(progress, fyProgress, fyOver, targetKg > 0) : "NO_RULE",
        byState: [...stateBase.entries()]
          .map(([stateCode, kg]) => ({ stateCode, baseQuantityKg: round3(kg) }))
          .sort((a, b) => b.baseQuantityKg - a.baseQuantityKg),
        rules: [...usedRules.values()],
      };
    });

  const targetTotal = sum(lines.map((l) => l.targetKg));
  const cappedFulfilled = sum(lines.map((l) => Math.min(l.fulfilledKg, l.targetKg)));
  const unverified = new Map<string, Rule>();
  for (const l of lines) for (const r of l.rules) if (!r.isVerified) unverified.set(r.id, r);

  return {
    financialYear: fy,
    fyProgress,
    lines,
    totals: {
      targetKg: round3(targetTotal),
      fulfilledKg: round3(sum(lines.map((l) => l.fulfilledKg))),
      shortfallKg: round3(sum(lines.map((l) => l.shortfallKg))),
      estimatedEcInr: sum(lines.map((l) => l.estimatedEcInr)),
      certificateSpendInr: Math.round(sum(certificates.filter((c) => c.financialYear === fy).map((c) => c.costInr ?? 0))),
    },
    score: targetTotal > 0 ? cappedFulfilled / targetTotal : null,
    unverifiedRules: [...unverified.values()],
  };
}
