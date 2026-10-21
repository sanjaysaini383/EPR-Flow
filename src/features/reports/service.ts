import "server-only";
import { computeCompliance } from "@/features/compliance/service";
import type { OrgContext } from "@/lib/auth/session";
import type { TenantDb } from "@/lib/db/tenant";
import {
  buildAnnualReturn,
  buildCertificateRegister,
  buildMaterialRegister,
  buildObligationSummary,
  type ReportCertificate,
  type ReportEntry,
  type ReportOrganization,
} from "@/lib/domain/reports/build";
import type { ReportDocument } from "@/lib/domain/reports/types";

/** Report kinds offered on the Reports page, with the formats each can be downloaded in. */
export const REPORT_KINDS = {
  "annual-return": {
    type: "CPCB_ANNUAL_RETURN",
    title: "CPCB annual return",
    description: "Entity details, state-wise quantities introduced, EPR obligation and fulfilment, certificates used and recycled content — laid out like the CPCB EPR portal return.",
    formats: ["xlsx", "pdf"],
  },
  "obligation-summary": {
    type: "OBLIGATION_SUMMARY",
    title: "Obligation summary",
    description: "A one-page management summary: score, target, fulfilment, remaining obligation and EC exposure by category.",
    formats: ["pdf", "xlsx"],
  },
  "material-register": {
    type: "MATERIAL_REGISTER",
    title: "Material register",
    description: "Every quantity entry for the year with brand, plant, GSTIN and source — the audit trail behind the return.",
    formats: ["xlsx", "csv"],
  },
  "certificate-register": {
    type: "CERTIFICATE_REGISTER",
    title: "Certificate register",
    description: "All EPR certificates for the year with recycler, status and quantity (and cost, for roles that can see it).",
    formats: ["xlsx", "csv"],
  },
} as const;

export type ReportKind = keyof typeof REPORT_KINDS;
export type ReportFormat = "xlsx" | "pdf" | "csv";

async function loadOrganization(db: TenantDb, org: OrgContext["org"]): Promise<ReportOrganization> {
  const gstins = await db.gstRegistration.findMany({
    where: { archivedAt: null },
    select: { gstin: true, stateCode: true },
    orderBy: { stateCode: "asc" },
  });
  return {
    name: org.name,
    legalName: org.legalName,
    pan: org.pan,
    cin: org.cin,
    cpcbRegistrationNo: org.cpcbRegistrationNo,
    registeredAddress: org.registeredAddress,
    headOfficeState: org.headOfficeState,
    entityTypes: org.entityTypes,
    wasteStreams: org.wasteStreams,
    gstins,
  };
}

async function loadCategories(db: TenantDb, org: OrgContext["org"]) {
  return db.materialCategory.findMany({
    where: { stream: { in: org.wasteStreams } },
    select: { id: true, name: true },
    orderBy: { sortOrder: "asc" },
  });
}

async function loadEntries(db: TenantDb, financialYear: string): Promise<ReportEntry[]> {
  const rows = await db.materialEntry.findMany({
    where: { deletedAt: null, financialYear },
    select: {
      periodMonth: true,
      categoryId: true,
      entityType: true,
      stateCode: true,
      quantityKg: true,
      recycledContentKg: true,
      isPreConsumer: true,
      source: true,
      notes: true,
      brand: { select: { name: true } },
      plant: { select: { name: true } },
      gstRegistration: { select: { gstin: true } },
    },
    orderBy: [{ periodMonth: "asc" }, { stateCode: "asc" }],
  });
  return rows.map((r) => ({
    periodMonth: r.periodMonth,
    categoryId: r.categoryId,
    entityType: r.entityType,
    stateCode: r.stateCode,
    quantityKg: Number(r.quantityKg),
    recycledContentKg: r.recycledContentKg === null ? null : Number(r.recycledContentKg),
    isPreConsumer: r.isPreConsumer,
    brand: r.brand?.name ?? null,
    plant: r.plant?.name ?? null,
    gstin: r.gstRegistration?.gstin ?? null,
    source: r.source,
    notes: r.notes,
  }));
}

async function loadCertificates(db: TenantDb, financialYear: string): Promise<ReportCertificate[]> {
  const rows = await db.certificate.findMany({
    where: { deletedAt: null, financialYear },
    select: {
      certificateNumber: true,
      categoryId: true,
      type: true,
      stateCode: true,
      quantityKg: true,
      issueDate: true,
      transferDate: true,
      costInr: true,
      status: true,
      recycler: { select: { name: true, cpcbRegistrationNo: true } },
    },
    orderBy: [{ issueDate: "asc" }, { certificateNumber: "asc" }],
  });
  return rows.map((c) => ({
    certificateNumber: c.certificateNumber,
    recyclerName: c.recycler.name,
    recyclerRegistrationNo: c.recycler.cpcbRegistrationNo,
    categoryId: c.categoryId,
    type: c.type,
    stateCode: c.stateCode,
    quantityKg: Number(c.quantityKg),
    issueDate: c.issueDate,
    transferDate: c.transferDate,
    costInr: c.costInr === null ? null : Number(c.costInr),
    status: c.status,
  }));
}

/** Builds the requested report from live data. Cost figures are included only for roles that may see them. */
export async function buildReport(ctx: OrgContext, kind: ReportKind, financialYear: string, now = new Date()): Promise<ReportDocument> {
  const { db, org } = ctx;
  const showCosts = ctx.can("costs.view");
  const [organization, categories] = await Promise.all([loadOrganization(db, org), loadCategories(db, org)]);
  const common = { organization, financialYear, categories, generatedAt: now };

  switch (kind) {
    case "annual-return": {
      const [result, entries, certificates] = await Promise.all([
        computeCompliance(db, org, financialYear, now),
        loadEntries(db, financialYear),
        loadCertificates(db, financialYear),
      ]);
      return buildAnnualReturn({ ...common, result, entries, certificates });
    }
    case "obligation-summary": {
      const [result, budget] = await Promise.all([
        computeCompliance(db, org, financialYear, now),
        showCosts ? db.budget.findFirst({ where: { financialYear, categoryId: null } }) : null,
      ]);
      return buildObligationSummary({ ...common, result, showCosts, budgetInr: budget ? Number(budget.amountInr) : null });
    }
    case "material-register":
      return buildMaterialRegister({ ...common, entries: await loadEntries(db, financialYear) });
    case "certificate-register":
      return buildCertificateRegister({ ...common, certificates: await loadCertificates(db, financialYear), showCosts });
  }
}

export function reportFileName(orgSlug: string, kind: string, financialYear: string | null, format: ReportFormat, now = new Date()) {
  const date = now.toISOString().slice(0, 10);
  return `${orgSlug}-${kind}${financialYear ? `-fy${financialYear}` : ""}-${date}.${format}`;
}

export const CONTENT_TYPES: Record<ReportFormat, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
  csv: "text/csv; charset=utf-8",
};
