import { parseFinancialYear } from "../financial-year";

/**
 * Certificate fraud checks (plan §6). Each check is a pure function over the
 * certificate and pre-computed context, so the rules are unit-tested and the
 * cross-tenant parts only ever see aggregates (counts, sums, a median) — never
 * another organisation's records.
 */

export type FlagType =
  | "DUPLICATE_NUMBER"
  | "DUPLICATE_CROSS_TENANT"
  | "DUPLICATE_FILE"
  | "UNVERIFIED_RECYCLER"
  | "CAPACITY_EXCEEDED"
  | "SUSPICIOUS_DATE"
  | "PRICE_OUTLIER"
  | "CATEGORY_MISMATCH";
export type FlagSeverity = "LOW" | "MEDIUM" | "HIGH";
export type Flag = { type: FlagType; severity: FlagSeverity; message: string; details?: Record<string, unknown> };

/** Tunable thresholds (not regulatory values). */
export const FRAUD_SETTINGS = {
  /** Price per kg further than this share from the market median is flagged. */
  priceDeviation: 0.5,
  /** Minimum approved certificates in the category/FY before the median is trusted. */
  minPriceSamples: 5,
};

/** Upper-case and strip whitespace, dashes and underscores: "epr - mh 0412/001" → "EPRMH0412/001". */
export function normalizeCertificateNumber(raw: string): string {
  return raw.normalize("NFKC").toUpperCase().replace(/[\s\-‐-―_]+/g, "");
}

export type CertificateFacts = {
  financialYear: string;
  categoryId: string;
  quantityKg: number;
  issueDate: Date;
  transferDate: Date | null;
  pricePerKgInr: number | null;
};

export type RecyclerFacts = {
  verificationStatus: "UNVERIFIED" | "PENDING" | "VERIFIED" | "SUSPENDED";
  registrationValidFrom: Date | null;
  registrationValidTo: Date | null;
  /** Categories the recycler holds capacity for in this FY; null when no capacity is on record at all. */
  registeredCategoryIds: string[] | null;
  /** Registered capacity for this category and FY, if known. */
  capacityKg: number | null;
};

export type FraudContext = {
  today: Date;
  /** Other live certificates in this organisation with the same normalised number. */
  sameOrgDuplicates: number;
  /** Live certificates in other organisations with the same normalised number. */
  otherOrgDuplicates: number;
  /** Other certificates in this organisation using a file with the same SHA-256. */
  duplicateFileCount: number;
  recycler: RecyclerFacts;
  /** Total issued by this recycler for this category and FY across all organisations, excluding this certificate. */
  issuedByRecyclerKg: number;
  /** Median price per kg of approved certificates in this category and FY across the platform. */
  marketMedianPricePerKg: number | null;
  marketSampleSize: number;
};

const t = (kg: number) => `${(kg / 1000).toLocaleString("en-IN", { maximumFractionDigits: 3 })} t`;
const day = (d: Date) => d.toISOString().slice(0, 10);

export function checkDuplicates(ctx: FraudContext): Flag[] {
  const flags: Flag[] = [];
  if (ctx.sameOrgDuplicates > 0) {
    flags.push({ type: "DUPLICATE_NUMBER", severity: "HIGH", message: "This certificate number is already recorded in your organisation." });
  }
  if (ctx.otherOrgDuplicates > 0) {
    // Anonymised on purpose: never reveal which organisation holds it.
    flags.push({ type: "DUPLICATE_CROSS_TENANT", severity: "HIGH", message: "This certificate number has already been claimed elsewhere on EPRFlow. Ask the recycler to confirm it was issued only to you." });
  }
  if (ctx.duplicateFileCount > 0) {
    flags.push({ type: "DUPLICATE_FILE", severity: "HIGH", message: "An identical certificate file is already attached to another certificate.", details: { count: ctx.duplicateFileCount } });
  }
  return flags;
}

export function checkRecycler(cert: CertificateFacts, r: RecyclerFacts): Flag[] {
  const flags: Flag[] = [];
  if (r.verificationStatus === "SUSPENDED") {
    flags.push({ type: "UNVERIFIED_RECYCLER", severity: "HIGH", message: "The recycler's registration is suspended or revoked." });
  } else if (r.registrationValidTo && r.registrationValidTo < cert.issueDate) {
    flags.push({ type: "UNVERIFIED_RECYCLER", severity: "HIGH", message: `The recycler's registration expired on ${day(r.registrationValidTo)}, before this certificate was issued.` });
  } else if (r.verificationStatus !== "VERIFIED") {
    flags.push({ type: "UNVERIFIED_RECYCLER", severity: "MEDIUM", message: "The recycler has not been verified against the CPCB register yet." });
  }
  if (r.registeredCategoryIds && !r.registeredCategoryIds.includes(cert.categoryId)) {
    flags.push({ type: "CATEGORY_MISMATCH", severity: "MEDIUM", message: "The recycler is not registered to process this category in this financial year." });
  }
  return flags;
}

export function checkCapacity(cert: CertificateFacts, ctx: FraudContext): Flag[] {
  const cap = ctx.recycler.capacityKg;
  if (cap === null || cap <= 0) return [];
  const total = ctx.issuedByRecyclerKg + cert.quantityKg;
  if (total <= cap) return [];
  return [
    {
      type: "CAPACITY_EXCEEDED",
      severity: "HIGH",
      message: `Certificates issued by this recycler for the category this year (${t(total)}) exceed its registered capacity (${t(cap)}).`,
      details: { utilisation: Math.round((total / cap) * 100) / 100 },
    },
  ];
}

export function checkDates(cert: CertificateFacts, r: RecyclerFacts, today: Date): Flag[] {
  const problems: string[] = [];
  const { start, end } = parseFinancialYear(cert.financialYear);
  if (cert.issueDate > today) problems.push("the issue date is in the future");
  if (cert.issueDate < start || cert.issueDate > end) problems.push(`the issue date is outside FY ${cert.financialYear}`);
  if (r.registrationValidFrom && cert.issueDate < r.registrationValidFrom) problems.push("it was issued before the recycler was registered");
  if (cert.transferDate && cert.transferDate < cert.issueDate) problems.push("the transfer date is before the issue date");
  if (cert.transferDate && cert.transferDate > today) problems.push("the transfer date is in the future");
  if (!problems.length) return [];
  const sentence = problems.join("; ");
  return [{ type: "SUSPICIOUS_DATE", severity: "MEDIUM", message: sentence.charAt(0).toUpperCase() + sentence.slice(1) + ".", details: { problems } }];
}

export function checkPrice(cert: CertificateFacts, ctx: FraudContext): Flag[] {
  const median = ctx.marketMedianPricePerKg;
  if (cert.pricePerKgInr === null || median === null || median <= 0 || ctx.marketSampleSize < FRAUD_SETTINGS.minPriceSamples) return [];
  const deviation = (cert.pricePerKgInr - median) / median;
  if (Math.abs(deviation) <= FRAUD_SETTINGS.priceDeviation) return [];
  const pct = Math.round(Math.abs(deviation) * 100);
  return [
    {
      type: "PRICE_OUTLIER",
      severity: "LOW",
      message: `₹${cert.pricePerKgInr.toFixed(2)}/kg is ${pct}% ${deviation > 0 ? "above" : "below"} the platform median of ₹${median.toFixed(2)}/kg for this category.`,
      details: { median, deviation: Math.round(deviation * 100) / 100 },
    },
  ];
}

/** Runs every check. Order is stable (highest-signal first) so results read consistently. */
export function runFraudChecks(cert: CertificateFacts, ctx: FraudContext): Flag[] {
  return [...checkDuplicates(ctx), ...checkRecycler(cert, ctx.recycler), ...checkCapacity(cert, ctx), ...checkDates(cert, ctx.recycler, ctx.today), ...checkPrice(cert, ctx)];
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Approval is blocked while any HIGH flag is open; lower severities need only a look. */
export function blocksApproval(flags: { severity: string; status: string }[]): boolean {
  return flags.some((f) => f.severity === "HIGH" && f.status === "OPEN");
}
