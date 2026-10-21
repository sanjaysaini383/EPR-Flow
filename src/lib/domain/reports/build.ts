import { PLACEHOLDER_NOTE } from "../rules/resolve";
import type { ComplianceResult, ObligationStatus } from "../obligations/calculate";
import { stateName } from "../states";
import { STREAM_LABELS } from "../deadlines/statutory";
import type { CellValue, ReportDocument, ReportSection } from "./types";

export const ENTITY_LABELS: Record<string, string> = { PRODUCER: "Producer", IMPORTER: "Importer", BRAND_OWNER: "Brand Owner" };

export const STATUS_LABELS: Record<ObligationStatus, string> = {
  MET: "Met",
  ON_TRACK: "On track",
  BEHIND: "Behind",
  AT_RISK: "At risk",
  SHORTFALL: "Shortfall",
  NO_RULE: "No rule",
  NO_OBLIGATION: "No obligation",
};

const CERT_TYPE_LABELS: Record<string, string> = { RECYCLING: "Recycling", END_OF_LIFE: "End of life" };
const CERT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const shortName = (name: string) => name.split(" – ")[0];

export type ReportOrganization = {
  name: string;
  legalName: string | null;
  pan: string | null;
  cin: string | null;
  cpcbRegistrationNo: string | null;
  registeredAddress: string | null;
  headOfficeState: string | null;
  entityTypes: string[];
  wasteStreams: string[];
  gstins: { gstin: string; stateCode: string }[];
};

export type ReportEntry = {
  periodMonth: Date;
  categoryId: string;
  entityType: string;
  stateCode: string;
  quantityKg: number;
  recycledContentKg: number | null;
  isPreConsumer: boolean;
  brand: string | null;
  plant: string | null;
  gstin: string | null;
  source: string;
  notes: string | null;
};

export type ReportCertificate = {
  certificateNumber: string;
  recyclerName: string;
  recyclerRegistrationNo: string | null;
  categoryId: string;
  type: string;
  stateCode: string | null;
  quantityKg: number;
  issueDate: Date;
  transferDate: Date | null;
  costInr: number | null;
  status: string;
};

type Common = {
  organization: ReportOrganization;
  financialYear: string;
  categories: { id: string; name: string }[];
  generatedAt: Date;
};

function categoryLabel(categories: Common["categories"], id: string) {
  return shortName(categories.find((c) => c.id === id)?.name ?? "Unknown category");
}

function disclaimer(result: ComplianceResult | null): string {
  const base =
    "Prepared by EPRFlow from data entered by the organisation. The layout follows the CPCB EPR portal annual return; " +
    "check the current portal format before filing.";
  return result && result.unverifiedRules.length > 0
    ? `${base} Some regulation values used are placeholders — ${PLACEHOLDER_NOTE}.`
    : base;
}

function entitySection(org: ReportOrganization, financialYear: string): ReportSection {
  const fields: [string, string][] = [
    ["Name of the entity", org.legalName || org.name],
    ["Trade name", org.name],
    ["Category of entity", org.entityTypes.map((t) => ENTITY_LABELS[t] ?? t).join(", ")],
    ["Waste streams", org.wasteStreams.map((s) => STREAM_LABELS[s] ?? s).join(", ")],
    ["CPCB EPR registration no.", org.cpcbRegistrationNo ?? "—"],
    ["PAN", org.pan ?? "—"],
    ["CIN", org.cin ?? "—"],
    ["Registered address", org.registeredAddress ?? "—"],
    ["Head office state", org.headOfficeState ? stateName(org.headOfficeState) : "—"],
    ["GSTIN(s)", org.gstins.map((g) => `${g.gstin} (${stateName(g.stateCode)})`).join(", ") || "—"],
    ["Financial year", financialYear],
  ];
  return {
    title: "1. Entity details",
    layout: "fields",
    columns: [
      { key: "field", label: "Field", kind: "text", width: 32 },
      { key: "value", label: "Details", kind: "text", width: 70 },
    ],
    rows: fields.map(([field, value]) => ({ field, value })),
  };
}

/** Quantity introduced in the FY, by state and category, split by pre-/post-consumer. */
function introducedSection(entries: ReportEntry[], categories: Common["categories"]): ReportSection {
  const groups = new Map<string, { stateCode: string; categoryId: string; post: number; pre: number; recycled: number }>();
  for (const e of entries) {
    const key = `${e.stateCode}|${e.categoryId}`;
    const g = groups.get(key) ?? { stateCode: e.stateCode, categoryId: e.categoryId, post: 0, pre: 0, recycled: 0 };
    if (e.isPreConsumer) g.pre += e.quantityKg;
    else g.post += e.quantityKg;
    g.recycled += e.recycledContentKg ?? 0;
    groups.set(key, g);
  }
  const rows = [...groups.values()]
    .sort((a, b) => stateName(a.stateCode).localeCompare(stateName(b.stateCode)) || categoryLabel(categories, a.categoryId).localeCompare(categoryLabel(categories, b.categoryId)))
    .map((g) => ({
      state: stateName(g.stateCode),
      category: categoryLabel(categories, g.categoryId),
      postConsumer: g.post,
      preConsumer: g.pre,
      total: g.post + g.pre,
      recycled: g.recycled,
    }));
  return {
    title: "2. Quantity introduced by state",
    note: "Tonnes. Pre-consumer quantities are reported but excluded from the EPR base.",
    columns: [
      { key: "state", label: "State / UT", kind: "text", width: 22 },
      { key: "category", label: "Category", kind: "text", width: 14 },
      { key: "postConsumer", label: "Post-consumer (t)", kind: "tonnes" },
      { key: "preConsumer", label: "Pre-consumer (t)", kind: "tonnes" },
      { key: "total", label: "Total (t)", kind: "tonnes" },
      { key: "recycled", label: "Recycled content used (t)", kind: "tonnes" },
    ],
    rows,
    totals: rows.length
      ? {
          state: "Total",
          postConsumer: sum(rows.map((r) => r.postConsumer)),
          preConsumer: sum(rows.map((r) => r.preConsumer)),
          total: sum(rows.map((r) => r.total)),
          recycled: sum(rows.map((r) => r.recycled)),
        }
      : undefined,
  };
}

function obligationSection(result: ComplianceResult, title: string): ReportSection {
  const rows = result.lines.map((l) => ({
    category: shortName(l.category.name),
    baseYears: l.baseYears.join(", ") || "—",
    base: l.baseQuantityKg,
    targetPercent: l.targetPercent,
    target: l.targetKg,
    recyclingMin: l.recyclingTargetKg,
    fulfilledRecycling: l.fulfilledRecyclingKg,
    fulfilledEol: l.fulfilledEolKg,
    fulfilled: l.fulfilledKg,
    shortfall: l.shortfallKg,
    status: STATUS_LABELS[l.status],
  }));
  return {
    title,
    note: "Base = average quantity placed on market in the base years (post-consumer). Fulfilment counts approved EPR certificates.",
    columns: [
      { key: "category", label: "Category", kind: "text", width: 12 },
      { key: "baseYears", label: "Base years", kind: "text", width: 18 },
      { key: "base", label: "Base (t)", kind: "tonnes" },
      { key: "targetPercent", label: "Target %", kind: "percent", width: 10 },
      { key: "target", label: "EPR target (t)", kind: "tonnes" },
      { key: "recyclingMin", label: "Min. recycling (t)", kind: "tonnes" },
      { key: "fulfilledRecycling", label: "Recycling certs (t)", kind: "tonnes" },
      { key: "fulfilledEol", label: "End-of-life certs (t)", kind: "tonnes" },
      { key: "fulfilled", label: "Fulfilled (t)", kind: "tonnes" },
      { key: "shortfall", label: "Remaining (t)", kind: "tonnes" },
      { key: "status", label: "Status", kind: "text", width: 12 },
    ],
    rows,
    totals: rows.length
      ? { category: "Total", target: result.totals.targetKg, fulfilled: result.totals.fulfilledKg, shortfall: result.totals.shortfallKg }
      : undefined,
  };
}

function certificatesUsedSection(certificates: ReportCertificate[], categories: Common["categories"], title: string): ReportSection {
  const approved = certificates.filter((c) => c.status === "APPROVED");
  const rows = approved.map((c) => ({
    number: c.certificateNumber,
    recycler: c.recyclerName,
    registration: c.recyclerRegistrationNo ?? "—",
    category: categoryLabel(categories, c.categoryId),
    type: CERT_TYPE_LABELS[c.type] ?? c.type,
    issueDate: c.issueDate,
    quantity: c.quantityKg,
  }));
  return {
    title,
    note: "Approved certificates only.",
    columns: [
      { key: "number", label: "Certificate no.", kind: "text", width: 22 },
      { key: "recycler", label: "Recycler / processor", kind: "text", width: 30 },
      { key: "registration", label: "Recycler reg. no.", kind: "text", width: 16 },
      { key: "category", label: "Category", kind: "text", width: 12 },
      { key: "type", label: "Type", kind: "text", width: 12 },
      { key: "issueDate", label: "Issued", kind: "date" },
      { key: "quantity", label: "Quantity (t)", kind: "tonnes" },
    ],
    rows,
    totals: rows.length ? { number: "Total", quantity: sum(rows.map((r) => r.quantity)) } : undefined,
  };
}

function recycledContentSection(result: ComplianceResult, title: string): ReportSection {
  const lines = result.lines.filter((l) => l.recycledContentPercent !== null);
  return {
    title,
    columns: [
      { key: "category", label: "Category", kind: "text", width: 12 },
      { key: "percent", label: "Mandated %", kind: "percent" },
      { key: "required", label: "Required (t)", kind: "tonnes" },
      { key: "actual", label: "Reported (t)", kind: "tonnes" },
      { key: "gap", label: "Gap (t)", kind: "tonnes" },
    ],
    rows: lines.map((l) => ({
      category: shortName(l.category.name),
      percent: l.recycledContentPercent,
      required: l.recycledContentRequiredKg,
      actual: l.recycledContentActualKg,
      gap: Math.max(0, l.recycledContentRequiredKg - l.recycledContentActualKg),
    })),
  };
}

function ecSection(result: ComplianceResult, title: string): ReportSection {
  const rows = result.lines.map((l) => ({
    category: shortName(l.category.name),
    shortfall: l.shortfallKg,
    rate: l.ecRateInrPerKg === null ? null : `₹${l.ecRateInrPerKg}/kg`,
    ec: l.estimatedEcInr,
  }));
  return {
    title,
    note: "Estimate of Environmental Compensation if the remaining obligation is not met by the end of the year.",
    columns: [
      { key: "category", label: "Category", kind: "text", width: 12 },
      { key: "shortfall", label: "Remaining (t)", kind: "tonnes" },
      { key: "rate", label: "EC rate", kind: "text", width: 12 },
      { key: "ec", label: "Estimated EC", kind: "inr" },
    ],
    rows,
    totals: rows.length ? { category: "Total", shortfall: result.totals.shortfallKg, ec: result.totals.estimatedEcInr } : undefined,
  };
}

/** CPCB-style annual return: entity details, quantities introduced, obligation, fulfilment, recycled content. */
export function buildAnnualReturn(
  input: Common & { result: ComplianceResult; entries: ReportEntry[]; certificates: ReportCertificate[] },
): ReportDocument {
  return {
    title: "EPR Annual Return",
    subtitle: `Financial year ${input.financialYear} · ${input.organization.wasteStreams.map((s) => STREAM_LABELS[s] ?? s).join(", ")}`,
    organizationName: input.organization.legalName || input.organization.name,
    generatedAt: input.generatedAt,
    sections: [
      entitySection(input.organization, input.financialYear),
      introducedSection(input.entries, input.categories),
      obligationSection(input.result, "3. EPR obligation and fulfilment"),
      certificatesUsedSection(input.certificates, input.categories, "4. EPR certificates used"),
      recycledContentSection(input.result, "5. Use of recycled content"),
    ],
    disclaimer: disclaimer(input.result),
  };
}

/** One-page management summary: headline figures, obligation and EC exposure. */
export function buildObligationSummary(
  input: Common & { result: ComplianceResult; showCosts: boolean; budgetInr: number | null },
): ReportDocument {
  const { result } = input;
  const headline: [string, CellValue, "text" | "tonnes" | "percent" | "inr"][] = [
    ["Compliance score", result.score === null ? "—" : `${Math.round(result.score * 100)}%`, "text"],
    ["Total EPR target", result.totals.targetKg, "tonnes"],
    ["Fulfilled", result.totals.fulfilledKg, "tonnes"],
    ["Remaining", result.totals.shortfallKg, "tonnes"],
    ["Share of year elapsed", Math.round(result.fyProgress * 100), "percent"],
  ];
  if (input.showCosts) {
    headline.push(["Estimated EC exposure", result.totals.estimatedEcInr, "inr"]);
    headline.push(["Certificate spend", result.totals.certificateSpendInr, "inr"]);
    if (input.budgetInr !== null) headline.push(["Budget", input.budgetInr, "inr"]);
  }
  const sections: ReportSection[] = [
    {
      title: "Headline figures",
      layout: "fields",
      columns: [
        { key: "field", label: "Measure", kind: "text", width: 32 },
        { key: "value", label: "Value", kind: "text", width: 30 },
      ],
      rows: headline.map(([field, value, kind]) => ({
        field,
        value: typeof value === "number" ? formatHeadline(value, kind) : value,
      })),
    },
    obligationSection(result, "Obligation by category"),
  ];
  if (input.showCosts) sections.push(ecSection(result, "Environmental Compensation exposure"));
  return {
    title: "EPR Obligation Summary",
    subtitle: `Financial year ${input.financialYear}`,
    organizationName: input.organization.legalName || input.organization.name,
    generatedAt: input.generatedAt,
    sections,
    disclaimer: disclaimer(result),
  };
}

const t3 = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
function formatHeadline(value: number, kind: string): string {
  if (kind === "tonnes") return `${t3.format(value / 1000)} t`;
  if (kind === "percent") return `${value}%`;
  if (kind === "inr") return `₹ ${inr.format(value)}`;
  return String(value);
}

export function buildMaterialRegister(input: Common & { entries: ReportEntry[] }): ReportDocument {
  const rows = [...input.entries]
    .sort((a, b) => a.periodMonth.getTime() - b.periodMonth.getTime() || a.stateCode.localeCompare(b.stateCode))
    .map((e) => ({
      month: e.periodMonth.toISOString().slice(0, 7),
      category: categoryLabel(input.categories, e.categoryId),
      entityType: ENTITY_LABELS[e.entityType] ?? e.entityType,
      state: stateName(e.stateCode),
      brand: e.brand,
      plant: e.plant,
      gstin: e.gstin,
      quantity: e.quantityKg,
      recycled: e.recycledContentKg,
      preConsumer: e.isPreConsumer ? "Yes" : "No",
      source: e.source === "IMPORT" ? "Import" : e.source === "AI_EXTRACTION" ? "AI extraction" : "Manual",
      notes: e.notes,
    }));
  return {
    title: "Material Register",
    subtitle: `Quantities placed on market · FY ${input.financialYear}`,
    organizationName: input.organization.legalName || input.organization.name,
    generatedAt: input.generatedAt,
    sections: [
      {
        title: "Entries",
        columns: [
          { key: "month", label: "Month", kind: "text", width: 10 },
          { key: "category", label: "Category", kind: "text", width: 12 },
          { key: "entityType", label: "Entity type", kind: "text", width: 14 },
          { key: "state", label: "State", kind: "text", width: 18 },
          { key: "brand", label: "Brand", kind: "text", width: 20 },
          { key: "plant", label: "Plant", kind: "text", width: 20 },
          { key: "gstin", label: "GSTIN", kind: "text", width: 18 },
          { key: "quantity", label: "Quantity (t)", kind: "tonnes" },
          { key: "recycled", label: "Recycled content (t)", kind: "tonnes" },
          { key: "preConsumer", label: "Pre-consumer", kind: "text", width: 12 },
          { key: "source", label: "Source", kind: "text", width: 12 },
          { key: "notes", label: "Notes", kind: "text", width: 30 },
        ],
        rows,
        totals: rows.length ? { month: "Total", quantity: sum(rows.map((r) => r.quantity)), recycled: sum(rows.map((r) => r.recycled ?? 0)) } : undefined,
      },
    ],
  };
}

export function buildCertificateRegister(input: Common & { certificates: ReportCertificate[]; showCosts: boolean }): ReportDocument {
  const rows = input.certificates.map((c) => ({
    number: c.certificateNumber,
    status: CERT_STATUS_LABELS[c.status] ?? c.status,
    recycler: c.recyclerName,
    registration: c.recyclerRegistrationNo ?? "—",
    category: categoryLabel(input.categories, c.categoryId),
    type: CERT_TYPE_LABELS[c.type] ?? c.type,
    state: c.stateCode ? stateName(c.stateCode) : null,
    issueDate: c.issueDate,
    transferDate: c.transferDate,
    quantity: c.quantityKg,
    ...(input.showCosts ? { cost: c.costInr, pricePerKg: c.costInr !== null && c.quantityKg > 0 ? Math.round((c.costInr / c.quantityKg) * 100) / 100 : null } : {}),
  }));
  const approved = rows.filter((r) => r.status === "Approved");
  return {
    title: "Certificate Register",
    subtitle: `EPR certificates · FY ${input.financialYear}`,
    organizationName: input.organization.legalName || input.organization.name,
    generatedAt: input.generatedAt,
    sections: [
      {
        title: "Certificates",
        note: "Totals include approved certificates only.",
        columns: [
          { key: "number", label: "Certificate no.", kind: "text", width: 22 },
          { key: "status", label: "Status", kind: "text", width: 16 },
          { key: "recycler", label: "Recycler / processor", kind: "text", width: 28 },
          { key: "registration", label: "Recycler reg. no.", kind: "text", width: 16 },
          { key: "category", label: "Category", kind: "text", width: 12 },
          { key: "type", label: "Type", kind: "text", width: 12 },
          { key: "state", label: "State", kind: "text", width: 16 },
          { key: "issueDate", label: "Issued", kind: "date" },
          { key: "transferDate", label: "Transferred", kind: "date" },
          { key: "quantity", label: "Quantity (t)", kind: "tonnes" },
          ...(input.showCosts
            ? [
                { key: "cost", label: "Cost", kind: "inr" as const },
                { key: "pricePerKg", label: "₹ per kg", kind: "number" as const },
              ]
            : []),
        ],
        rows,
        totals: approved.length
          ? {
              number: "Total (approved)",
              quantity: sum(approved.map((r) => r.quantity)),
              ...(input.showCosts ? { cost: sum(approved.map((r) => ("cost" in r && typeof r.cost === "number" ? r.cost : 0))) } : {}),
            }
          : undefined,
      },
    ],
  };
}

/** Field-level changes between two audit snapshots, for display. Nested values are compared as JSON. */
export function diffChanges(before: unknown, after: unknown): { field: string; before: string; after: string }[] {
  const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
  const b = asRecord(before);
  const a = asRecord(after);
  const show = (v: unknown) => (v === undefined || v === null ? "—" : typeof v === "string" ? v : JSON.stringify(v));
  return [...new Set([...Object.keys(b), ...Object.keys(a)])]
    .filter((k) => JSON.stringify(b[k]) !== JSON.stringify(a[k]))
    .map((field) => ({ field, before: show(b[field]), after: show(a[field]) }));
}

export type AuditExportEntry = {
  createdAt: Date;
  actorName: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string;
  ip: string | null;
  before: unknown;
  after: unknown;
};

const istStamp = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Kolkata" });

export function buildAuditExport(input: { organizationName: string; entries: AuditExportEntry[]; filterLabel: string; generatedAt: Date }): ReportDocument {
  return {
    title: "Audit Log",
    subtitle: input.filterLabel,
    organizationName: input.organizationName,
    generatedAt: input.generatedAt,
    sections: [
      {
        title: "Activity",
        columns: [
          { key: "when", label: "When (IST)", kind: "text", width: 22 },
          { key: "who", label: "Who", kind: "text", width: 24 },
          { key: "email", label: "Email", kind: "text", width: 28 },
          { key: "action", label: "Action", kind: "text", width: 24 },
          { key: "entity", label: "Record type", kind: "text", width: 16 },
          { key: "entityId", label: "Record id", kind: "text", width: 28 },
          { key: "ip", label: "IP address", kind: "text", width: 16 },
          { key: "changes", label: "Changes", kind: "text", width: 60 },
        ],
        rows: input.entries.map((e) => ({
          when: istStamp.format(e.createdAt),
          who: e.actorName ?? (e.actorEmail ? null : "System"),
          email: e.actorEmail,
          action: e.action,
          entity: e.entityType,
          entityId: e.entityId,
          ip: e.ip,
          changes:
            diffChanges(e.before, e.after)
              .map((c) => `${c.field}: ${c.before} → ${c.after}`)
              .join("; ") || null,
        })),
      },
    ],
  };
}
