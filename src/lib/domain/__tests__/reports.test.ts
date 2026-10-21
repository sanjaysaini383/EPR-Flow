import { describe, expect, it } from "vitest";
import { renderCsv } from "@/lib/reports/csv";
import { renderPdf } from "@/lib/reports/pdf";
import { renderXlsx } from "@/lib/reports/xlsx";
import { calculateCompliance } from "../obligations/calculate";
import {
  buildAnnualReturn,
  buildAuditExport,
  buildCertificateRegister,
  buildMaterialRegister,
  buildObligationSummary,
  diffChanges,
  type ReportCertificate,
  type ReportEntry,
  type ReportOrganization,
} from "../reports/build";
import { formatCell } from "../reports/types";
import type { Rule } from "../rules/resolve";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const CAT_I = { id: "c1", code: "PLASTIC_CAT_I", name: "Category I – Rigid plastic packaging", stream: "PLASTIC", sortOrder: 0 };
const CAT_II = { id: "c2", code: "PLASTIC_CAT_II", name: "Category II – Flexible plastic packaging", stream: "PLASTIC", sortOrder: 1 };

const rule = (over: Partial<Rule>): Rule => ({
  id: "epr",
  stream: "PLASTIC",
  categoryId: null,
  entityType: null,
  ruleType: "EPR_TARGET",
  financialYear: null,
  value: 100,
  unit: "PERCENT",
  parameters: { baseMethod: "AVERAGE_PREVIOUS_YEARS", lookbackYears: 2, deductPreConsumer: true },
  effectiveFrom: d("2022-04-01"),
  effectiveTo: null,
  version: 1,
  isVerified: false,
  ...over,
});

const ORG: ReportOrganization = {
  name: "Acme",
  legalName: "Acme Foods Private Limited",
  pan: "AAACA1234F",
  cin: null,
  cpcbRegistrationNo: "PWP/BO/2023/001",
  registeredAddress: "Pune",
  headOfficeState: "MH",
  entityTypes: ["BRAND_OWNER"],
  wasteStreams: ["PLASTIC"],
  gstins: [{ gstin: "27AAACA1234F1Z5", stateCode: "MH" }],
};

const entry = (over: Partial<ReportEntry>): ReportEntry => ({
  periodMonth: d("2025-05-01"),
  categoryId: "c1",
  entityType: "BRAND_OWNER",
  stateCode: "MH",
  quantityKg: 1000,
  recycledContentKg: null,
  isPreConsumer: false,
  brand: "Crunch",
  plant: null,
  gstin: null,
  source: "MANUAL",
  notes: null,
  ...over,
});

const certificate = (over: Partial<ReportCertificate>): ReportCertificate => ({
  certificateNumber: "EPR-0001",
  recyclerName: "Shree Recyclers",
  recyclerRegistrationNo: "PWP-MH-0412",
  categoryId: "c1",
  type: "RECYCLING",
  stateCode: "MH",
  quantityKg: 500,
  issueDate: d("2025-09-01"),
  transferDate: null,
  costInr: 10_000,
  status: "APPROVED",
  ...over,
});

const entries = [
  entry({}),
  entry({ stateCode: "KA", quantityKg: 2500 }),
  entry({ categoryId: "c2", quantityKg: 800, isPreConsumer: true }),
  entry({ periodMonth: d("2025-06-01"), quantityKg: 500, recycledContentKg: 100 }),
];
const certificates = [certificate({}), certificate({ certificateNumber: "EPR-0002", status: "DRAFT", quantityKg: 9999 })];

const result = calculateCompliance({
  financialYear: "2025-26",
  categories: [CAT_I, CAT_II],
  quantities: [
    { financialYear: "2023-24", categoryId: "c1", entityType: "BRAND_OWNER", stateCode: "MH", quantityKg: 2000, recycledContentKg: null, isPreConsumer: false },
    { financialYear: "2024-25", categoryId: "c1", entityType: "BRAND_OWNER", stateCode: "MH", quantityKg: 4000, recycledContentKg: null, isPreConsumer: false },
  ],
  certificates: [{ financialYear: "2025-26", categoryId: "c1", type: "RECYCLING", quantityKg: 500, costInr: 10_000 }],
  rules: [rule({}), rule({ id: "ec", ruleType: "EC_RATE", categoryId: "c1", value: 5, unit: "INR_PER_KG", parameters: null })],
  today: d("2025-10-01"),
});

const common = { organization: ORG, financialYear: "2025-26", categories: [CAT_I, CAT_II], generatedAt: new Date("2026-05-02T06:30:00Z") };

describe("annual return", () => {
  const doc = buildAnnualReturn({ ...common, result, entries, certificates });

  it("has the CPCB return sections in order", () => {
    expect(doc.sections.map((s) => s.title)).toEqual([
      "1. Entity details",
      "2. Quantity introduced by state",
      "3. EPR obligation and fulfilment",
      "4. EPR certificates used",
      "5. Use of recycled content",
    ]);
    expect(doc.organizationName).toBe("Acme Foods Private Limited");
  });

  it("aggregates quantities by state and category, separating pre-consumer", () => {
    const introduced = doc.sections[1];
    expect(introduced.rows).toEqual([
      { state: "Karnataka", category: "Category I", postConsumer: 2500, preConsumer: 0, total: 2500, recycled: 0 },
      { state: "Maharashtra", category: "Category I", postConsumer: 1500, preConsumer: 0, total: 1500, recycled: 100 },
      { state: "Maharashtra", category: "Category II", postConsumer: 0, preConsumer: 800, total: 800, recycled: 0 },
    ]);
    expect(introduced.totals).toMatchObject({ postConsumer: 4000, preConsumer: 800, total: 4800 });
  });

  it("reports the obligation from the engine and lists only approved certificates", () => {
    const obligation = doc.sections[2].rows.find((r) => r.category === "Category I")!;
    expect(obligation).toMatchObject({ base: 3000, target: 3000, fulfilled: 500, shortfall: 2500 });
    expect(doc.sections[3].rows.map((r) => r.number)).toEqual(["EPR-0001"]);
  });

  it("flags placeholder rules in the disclaimer", () => {
    expect(doc.disclaimer).toContain("VERIFY WITH LATEST CPCB NOTIFICATION");
  });
});

describe("registers and summary", () => {
  it("hides cost columns from roles without cost access", () => {
    const withCosts = buildCertificateRegister({ ...common, certificates, showCosts: true });
    const withoutCosts = buildCertificateRegister({ ...common, certificates, showCosts: false });
    expect(withCosts.sections[0].columns.map((c) => c.key)).toContain("cost");
    expect(withoutCosts.sections[0].columns.map((c) => c.key)).not.toContain("cost");
    expect(withoutCosts.sections[0].rows.every((r) => !("cost" in r))).toBe(true);
    // Totals count approved certificates only.
    expect(withCosts.sections[0].totals).toMatchObject({ quantity: 500, cost: 10_000 });

    const summary = buildObligationSummary({ ...common, result, showCosts: false, budgetInr: 500_000 });
    expect(summary.sections.map((s) => s.title)).not.toContain("Environmental Compensation exposure");
    expect(JSON.stringify(summary)).not.toContain("Budget");
  });

  it("lists material entries in date order with readable labels", () => {
    const register = buildMaterialRegister({ ...common, entries });
    const rows = register.sections[0].rows;
    expect(rows.at(-1)).toMatchObject({ month: "2025-06", category: "Category I", entityType: "Brand Owner", state: "Maharashtra" });
    expect(register.sections[0].totals).toMatchObject({ quantity: 4800, recycled: 100 });
  });
});

describe("audit diff and export", () => {
  it("lists only fields that changed", () => {
    expect(diffChanges({ name: "A", role: "VIEWER", n: 1 }, { name: "A", role: "ADMIN", n: 1 })).toEqual([{ field: "role", before: "VIEWER", after: "ADMIN" }]);
    expect(diffChanges(null, { email: "x@y.in" })).toEqual([{ field: "email", before: "—", after: "x@y.in" }]);
    expect(diffChanges({ tags: [1, 2] }, { tags: [1, 2] })).toEqual([]);
  });

  it("summarises changes per audit row", () => {
    const doc = buildAuditExport({
      organizationName: "Acme",
      filterLabel: "All activity",
      generatedAt: common.generatedAt,
      entries: [
        { createdAt: d("2026-05-01"), actorName: null, actorEmail: null, action: "member.role_change", entityType: "Membership", entityId: "m1", ip: null, before: { role: "VIEWER" }, after: { role: "ADMIN" } },
      ],
    });
    expect(doc.sections[0].rows[0]).toMatchObject({ who: "System", changes: "role: VIEWER → ADMIN" });
  });
});

describe("renderers", () => {
  const doc = buildAnnualReturn({ ...common, result, entries, certificates });

  it("formats cells consistently", () => {
    expect(formatCell(1234567, "tonnes")).toBe("1,234.567");
    expect(formatCell(250000, "inr")).toBe("₹ 2,50,000");
    expect(formatCell(250000, "inr", "Rs.")).toBe("Rs. 2,50,000");
    expect(formatCell(null, "text")).toBe("—");
    expect(formatCell(d("2026-06-30"), "date")).toBe("30 Jun 2026");
  });

  it("renders a valid PDF even with characters the built-in fonts lack", async () => {
    const pdf = await renderPdf({ ...doc, organizationName: "Acme ₹ 漢字 Foods" });
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
    expect(pdf.byteLength).toBeGreaterThan(2000);
  });

  it("renders an Excel workbook with numeric tonnes", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await renderXlsx(doc)) as never);
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      "Cover",
      "Entity details",
      "Quantity introduced by state",
      "EPR obligation and fulfilment",
      "EPR certificates used",
      "Use of recycled content",
    ]);
    const sheet = wb.getWorksheet("Quantity introduced by state")!;
    // Title, note, header, then the first data row (Karnataka, 2.5 t).
    expect(sheet.getRow(4).getCell(3).value).toBe(2.5);
  });

  it("neutralises spreadsheet formulas in CSV output", () => {
    const register = buildMaterialRegister({ ...common, entries: [entry({ notes: "=HYPERLINK(\"http://evil\")" })] });
    const csv = renderCsv(register);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("1.000");
  });
});
