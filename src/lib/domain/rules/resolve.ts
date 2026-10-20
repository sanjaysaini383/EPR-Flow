import { parseFinancialYear } from "../financial-year";

/** Plain-data view of a RegulationRule row (Decimal → number), so the engine has no Prisma dependency. */
export type Rule = {
  id: string;
  stream: string;
  categoryId: string | null;
  entityType: string | null;
  ruleType: string;
  financialYear: string | null;
  value: number;
  unit: string;
  parameters: Record<string, unknown> | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  version: number;
  isVerified: boolean;
};

export type RuleQuery = {
  ruleType: string;
  stream: string;
  categoryId: string;
  entityType: string;
  financialYear: string;
};

function appliesTo(rule: Rule, q: RuleQuery): boolean {
  if (rule.ruleType !== q.ruleType || rule.stream !== q.stream) return false;
  if (rule.categoryId && rule.categoryId !== q.categoryId) return false;
  if (rule.entityType && rule.entityType !== q.entityType) return false;
  if (rule.financialYear) return rule.financialYear === q.financialYear;
  const { start } = parseFinancialYear(q.financialYear);
  return rule.effectiveFrom <= start && (rule.effectiveTo === null || rule.effectiveTo > start);
}

/**
 * Picks the rule that governs one obligation:
 *   1. most specific scope wins (category beats stream-wide, entity type breaks ties),
 *   2. then the highest version (later edits supersede earlier ones),
 *   3. then the most recent effective date.
 */
export function resolveRule(rules: Rule[], q: RuleQuery): Rule | null {
  const candidates = rules.filter((r) => appliesTo(r, q));
  if (candidates.length === 0) return null;
  const score = (r: Rule) => (r.categoryId ? 2 : 0) + (r.entityType ? 1 : 0);
  return candidates.sort(
    (a, b) =>
      score(b) - score(a) || b.version - a.version || b.effectiveFrom.getTime() - a.effectiveFrom.getTime(),
  )[0];
}

export const PLACEHOLDER_NOTE = "VERIFY WITH LATEST CPCB NOTIFICATION";
