import { z } from "zod";
import { parseFinancialYear } from "../financial-year";
import { resolveRule, type Rule } from "../rules/resolve";

export const STREAM_LABELS: Record<string, string> = {
  PLASTIC: "Plastic packaging",
  EWASTE: "E-waste",
  BATTERY: "Battery",
};

/**
 * One due date defined by a FILING_DEADLINE rule. The date is relative to the
 * financial year: `yearOffset` 1 with month 6 / day 30 means "30 June after the FY ends".
 */
const deadlineSpec = z.object({
  key: z.string().regex(/^[a-z0-9-]{2,40}$/),
  title: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
  yearOffset: z.number().int().min(0).max(2),
});
export type DeadlineSpec = z.infer<typeof deadlineSpec>;

const legacyDue = /^(\d{2})-(\d{2})$/;

/**
 * Reads the deadline list from a FILING_DEADLINE rule's parameters. Accepts the
 * `{ deadlines: [...] }` form, and the older `{ annualReturnDue: "MM-DD" }` shorthand.
 * Invalid entries are skipped rather than breaking the calendar.
 */
export function parseDeadlineSpecs(parameters: Record<string, unknown> | null): DeadlineSpec[] {
  if (!parameters) return [];
  if (Array.isArray(parameters.deadlines)) {
    return parameters.deadlines.flatMap((d) => {
      const parsed = deadlineSpec.safeParse(d);
      return parsed.success ? [parsed.data] : [];
    });
  }
  const legacy = typeof parameters.annualReturnDue === "string" ? legacyDue.exec(parameters.annualReturnDue) : null;
  if (legacy) {
    return [{ key: "annual-return", title: "Annual return", month: Number(legacy[1]), day: Number(legacy[2]), yearOffset: 1 }];
  }
  return [];
}

/** Due date for a spec in a given FY; days past the end of the month are clamped (31 Feb → 28/29 Feb). */
export function dueDateFor(spec: Pick<DeadlineSpec, "month" | "day" | "yearOffset">, financialYear: string): Date {
  const { startYear } = parseFinancialYear(financialYear);
  const year = startYear + spec.yearOffset;
  const lastDay = new Date(Date.UTC(year, spec.month, 0)).getUTCDate();
  return new Date(Date.UTC(year, spec.month - 1, Math.min(spec.day, lastDay)));
}

export type StatutoryDeadline = {
  dedupeKey: string;
  title: string;
  description: string | null;
  dueDate: Date;
  financialYear: string;
  stream: string;
  ruleId: string;
  isVerified: boolean;
};

/**
 * Deadlines that follow from the regulation rules for each waste stream the
 * organisation handles. Pure: the caller stores them (idempotently, by `dedupeKey`).
 */
export function buildStatutoryDeadlines(input: { rules: Rule[]; streams: string[]; financialYears: string[] }): StatutoryDeadline[] {
  const out: StatutoryDeadline[] = [];
  for (const stream of input.streams) {
    for (const financialYear of input.financialYears) {
      const rule = resolveRule(input.rules, { ruleType: "FILING_DEADLINE", stream, categoryId: "", entityType: "", financialYear });
      if (!rule) continue;
      for (const spec of parseDeadlineSpecs(rule.parameters)) {
        out.push({
          dedupeKey: `statutory:${stream}:${spec.key}:${financialYear}`,
          title: `${spec.title} — ${STREAM_LABELS[stream] ?? stream}, FY ${financialYear}`,
          description: spec.description ?? null,
          dueDate: dueDateFor(spec, financialYear),
          financialYear,
          stream,
          ruleId: rule.id,
          isVerified: rule.isVerified,
        });
      }
    }
  }
  return out.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}
