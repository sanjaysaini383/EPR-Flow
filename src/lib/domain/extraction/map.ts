import { financialYearOf, isFinancialYear } from "../financial-year";
import { matchCategory, matchState } from "../materials/import";
import { stateFromGstCode } from "../states";
import { MAX_QUANTITY_KG, parseUnit, toKg } from "../units";
import type { CertificateExtraction, InvoiceExtraction } from "@/lib/ai/schemas";

/**
 * Turns what the AI read into editable drafts. Nothing here is trusted: every
 * value is re-validated by the same schemas as manual entry when the reviewer
 * saves, and anything uncertain is listed for the reviewer to check.
 */

export const LOW_CONFIDENCE = 0.75;

type Category = { id: string; code: string; name: string; stream: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
function validDate(raw: string | null): string | null {
  if (!raw || !DATE.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00Z`);
  return d.toISOString().slice(0, 10) === raw ? raw : null;
}

const regKey = (v: string | null) => (v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const nameKey = (v: string | null) =>
  (v ?? "")
    .toLowerCase()
    .replace(/\b(pvt|private|ltd|limited|llp|co|company|india)\b/g, "")
    .replace(/[^a-z0-9]/g, "");

export function lowConfidenceFields(confidence: Record<string, number>, labels: Record<string, string>): string[] {
  return Object.entries(confidence)
    .filter(([k, c]) => labels[k] && c < LOW_CONFIDENCE)
    .sort((a, b) => a[1] - b[1])
    .map(([k, c]) => `${labels[k]} (${Math.round(c * 100)}% sure)`);
}

export const CERTIFICATE_FIELD_LABELS: Record<string, string> = {
  certificateNumber: "Certificate number",
  recyclerName: "Recycler",
  recyclerRegistrationNo: "Recycler registration",
  category: "Category",
  certificateType: "Type",
  quantityKg: "Quantity",
  issueDate: "Issue date",
  transferDate: "Transfer date",
  financialYear: "Financial year",
};

export function certificateDraft(
  x: CertificateExtraction,
  ctx: { categories: Category[]; enabledStreams: string[]; recyclers: { id: string; name: string; registrationNo: string | null }[] },
) {
  const notes: string[] = [];
  const reg = regKey(x.recyclerRegistrationNo);
  const recycler =
    (reg && ctx.recyclers.find((r) => regKey(r.registrationNo) === reg)) ||
    (nameKey(x.recyclerName) && ctx.recyclers.find((r) => nameKey(r.name) === nameKey(x.recyclerName))) ||
    null;
  if (!recycler && (x.recyclerName || x.recyclerRegistrationNo)) {
    notes.push(`Recycler “${[x.recyclerName, x.recyclerRegistrationNo].filter(Boolean).join(", ")}” is not in your directory — add it on the Recyclers page, then select it.`);
  }

  const category = x.category ? matchCategory(x.category, ctx) : null;
  if (x.category && !category) notes.push(`Category “${x.category}” does not match one of your categories.`);

  const issueDate = validDate(x.issueDate);
  if (x.issueDate && !issueDate) notes.push(`The issue date “${x.issueDate}” could not be read as a date.`);
  const financialYear = x.financialYear && isFinancialYear(x.financialYear) ? x.financialYear : issueDate ? financialYearOf(new Date(`${issueDate}T00:00:00Z`)) : undefined;

  const quantityOk = x.quantityKg !== null && x.quantityKg > 0 && x.quantityKg <= MAX_QUANTITY_KG;
  if (x.quantityKg !== null && !quantityOk) notes.push("The quantity read from the document is not plausible — enter it from the certificate.");

  return {
    defaults: {
      certificateNumber: x.certificateNumber ?? undefined,
      recyclerId: recycler?.id,
      categoryId: category?.id,
      type: x.certificateType ?? undefined,
      financialYear,
      quantity: quantityOk ? String(Math.round(x.quantityKg! * 1000) / 1000) : undefined,
      issueDate: issueDate ?? undefined,
      transferDate: validDate(x.transferDate),
    },
    check: lowConfidenceFields(x.confidence, CERTIFICATE_FIELD_LABELS),
    notes: [...notes, ...x.warnings],
  };
}

export type InvoiceRowDraft = {
  description: string;
  categoryId: string | null;
  quantityKg: number | null;
  confidence: number;
  issue: string | null;
};

export function invoiceDraft(
  x: InvoiceExtraction,
  ctx: { categories: Category[]; enabledStreams: string[]; gstins: { id: string; gstin: string; stateCode: string }[] },
) {
  const notes: string[] = [];
  const date = validDate(x.invoiceDate);
  if (!date) notes.push("The invoice date could not be read — choose the month.");

  const seller = x.sellerGstin ? ctx.gstins.find((g) => g.gstin === x.sellerGstin!.toUpperCase().replace(/\s/g, "")) : undefined;
  if (x.sellerGstin && !seller) notes.push(`Seller GSTIN ${x.sellerGstin} is not one of your registrations.`);

  // EPR quantities are reported where the goods were placed on the market: the place of supply.
  const fromPlace = x.placeOfSupply ? (matchState(x.placeOfSupply) ?? stateFromGstCode(x.placeOfSupply.replace(/\D/g, "").padStart(2, "0").slice(0, 2))) : null;
  const fromBuyer = x.buyerGstin && /^\d{2}/.test(x.buyerGstin) ? stateFromGstCode(x.buyerGstin.slice(0, 2)) : null;
  const stateCode = fromPlace ?? fromBuyer ?? seller?.stateCode ?? null;
  if (!stateCode) notes.push("The state could not be determined — choose it.");

  const rows: InvoiceRowDraft[] = x.lines.map((l) => {
    const category = l.packagingCategory ? matchCategory(l.packagingCategory, ctx) : null;
    let kg: number | null = l.weightKg !== null && l.weightKg > 0 ? l.weightKg : null;
    if (kg === null && l.quantity !== null && l.unit) {
      const unit = parseUnit(l.unit);
      if (unit) kg = toKg(l.quantity, unit);
    }
    if (kg !== null && kg > MAX_QUANTITY_KG) kg = null;
    const issue = kg === null ? "Weight not printed — enter the plastic weight in kg" : !category ? "Choose the packaging category" : l.confidence < LOW_CONFIDENCE ? "Low confidence — check this line" : null;
    return { description: l.description, categoryId: category?.id ?? null, quantityKg: kg === null ? null : Math.round(kg * 1000) / 1000, confidence: l.confidence, issue };
  });
  if (rows.length === 0) notes.push("No packaging lines were found on this invoice.");

  return {
    month: date ? date.slice(0, 7) : null,
    stateCode,
    gstRegistrationId: seller?.id ?? null,
    rows,
    check: lowConfidenceFields(x.confidence, { invoiceNumber: "Invoice number", invoiceDate: "Invoice date", placeOfSupply: "Place of supply", buyerGstin: "Buyer GSTIN" }),
    notes: [...notes, ...x.warnings],
    reference: [x.invoiceNumber && `Invoice ${x.invoiceNumber}`, x.buyerName && `to ${x.buyerName}`].filter(Boolean).join(" ") || null,
  };
}
