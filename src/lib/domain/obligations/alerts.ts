import { parseFinancialYear } from "../financial-year";
import type { ComplianceResult } from "./calculate";

export type AlertSpec = {
  dedupeKey: string; // stable per condition, so re-running never duplicates an alert
  severity: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  body: string;
  link: string; // path relative to the org, e.g. "targets"
};

function monthsLeft(fy: string, today: Date): number {
  const { end } = parseFinancialYear(fy);
  const months = (end.getUTCFullYear() - today.getUTCFullYear()) * 12 + (end.getUTCMonth() - today.getUTCMonth());
  return Math.max(0, months + (today <= end ? 1 : 0));
}

const shortName = (name: string) => name.split(" – ")[0].replace("Category", "Cat");

/** Turns a compliance result into the alerts a compliance manager should see. Pure. */
export function buildAlerts(result: ComplianceResult, today: Date): AlertSpec[] {
  const fy = result.financialYear;
  const left = monthsLeft(fy, today);
  const leftText = left === 0 ? "the financial year has ended" : `${left} month${left === 1 ? "" : "s"} left`;
  const alerts: AlertSpec[] = [];

  for (const line of result.lines) {
    const cat = shortName(line.category.name);
    const gap = Math.round(((line.expectedProgress - (line.progress ?? 0)) * 100));
    if (line.status === "AT_RISK" || line.status === "BEHIND") {
      alerts.push({
        dedupeKey: `behind:${fy}:${line.category.code}`,
        severity: line.status === "AT_RISK" ? "CRITICAL" : "WARNING",
        title: `You are ${gap}% behind on ${cat} target with ${leftText}`,
        body: `${Math.round((line.progress ?? 0) * 100)}% of the ${cat} obligation is fulfilled, against ${Math.round(line.expectedProgress * 100)}% of the year elapsed.`,
        link: "targets",
      });
    }
    if (line.status === "SHORTFALL") {
      alerts.push({
        dedupeKey: `shortfall:${fy}:${line.category.code}`,
        severity: "CRITICAL",
        title: `${cat} obligation for FY ${fy} was not met`,
        body: `Shortfall of ${Math.round(line.shortfallKg / 100) / 10} t may attract Environmental Compensation.`,
        link: "targets",
      });
    }
    if (
      line.recycledContentRequiredKg > 0 &&
      result.fyProgress >= 0.5 &&
      line.recycledContentActualKg < line.recycledContentRequiredKg * 0.9
    ) {
      alerts.push({
        dedupeKey: `recycled-content:${fy}:${line.category.code}`,
        severity: "WARNING",
        title: `${cat} recycled content is below the required ${line.recycledContentPercent}%`,
        body: `Reported recycled content is ${Math.round((line.recycledContentActualKg / line.recycledContentRequiredKg) * 100)}% of what this year's quantity requires.`,
        link: "targets",
      });
    }
    if (line.status === "NO_RULE") {
      alerts.push({
        dedupeKey: `no-rule:${fy}:${line.category.code}`,
        severity: "WARNING",
        title: `No EPR target is configured for ${cat} in FY ${fy}`,
        body: "The obligation cannot be calculated until a regulation rule exists for this category and year.",
        link: "targets",
      });
    }
  }

  if (result.unverifiedRules.length > 0) {
    alerts.push({
      dedupeKey: `unverified-rules:${fy}`,
      severity: "INFO",
      title: "Targets use placeholder regulation values",
      body: `${result.unverifiedRules.length} rule value(s) in use are not yet verified against the latest CPCB notification.`,
      link: "targets",
    });
  }

  return alerts;
}
