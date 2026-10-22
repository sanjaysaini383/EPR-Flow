"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { existingEntryKeys, entryKey } from "@/features/materials/queries";
import { fieldErrors, handleActionError, type ActionState } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/session";
import { checkReportingMonth, financialYearOf, parseMonth } from "@/lib/domain/financial-year";
import { STATE_CODES } from "@/lib/domain/states";
import { MAX_QUANTITY_KG, parseNumber } from "@/lib/domain/units";
import { storeDocument } from "@/lib/files/documents";
import { DocumentError } from "@/lib/files/sniff";
import { LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { StorageNotConfiguredError } from "@/lib/storage";
import { runExtraction } from "./service";

const ID = /^[a-z0-9]{10,40}$/i;

/** Upload a certificate or invoice; the AI reads it in the background after the response. */
export async function uploadExtractionAction(orgSlug: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  let id: string;
  try {
    const { db, org, user } = await requirePermission(orgSlug, "data.write");
    const target = formData.get("target");
    if (target !== "CERTIFICATE" && target !== "MATERIAL_ENTRY") return { error: "Choose what the document is.", fieldErrors: { target: ["Choose what the document is"] } };
    const upload = formData.get("file");
    if (!(upload instanceof File) || upload.size === 0) return { error: "Choose a file to upload.", fieldErrors: { file: ["Choose a PDF or image"] } };

    await rateLimit(`extract:${org.id}`, LIMITS.extractionPerOrg);
    const file = await storeDocument(db, {
      organizationId: org.id,
      userId: user.id,
      file: upload,
      kind: target === "CERTIFICATE" ? "CERTIFICATE_PDF" : "INVOICE",
      allowed: ["application/pdf", "image/png", "image/jpeg", "image/webp"],
    });
    const extraction = await db.$transaction(async (tx) => {
      const e = await tx.extraction.create({ data: { organizationId: org.id, fileId: file.id, target, createdById: user.id } });
      await audit(tx, { organizationId: org.id, actorId: user.id, action: "extraction.upload", entityType: "Extraction", entityId: e.id, after: { target, fileName: file.fileName, sha256: file.sha256 } });
      return e;
    });
    id = extraction.id;
    after(() => runExtraction(db, extraction.id));
  } catch (error) {
    if (error instanceof DocumentError) return { error: error.message, fieldErrors: { file: [error.message] } };
    if (error instanceof StorageNotConfiguredError) return { error: error.message };
    return handleActionError(error);
  }
  redirect(`/o/${orgSlug}/extractions/${id}`);
}

export async function retryExtractionAction(orgSlug: string, id: string): Promise<ActionState> {
  try {
    if (!ID.test(id)) return { error: "Invalid request." };
    const { db, org } = await requirePermission(orgSlug, "data.write");
    await rateLimit(`extract:${org.id}`, LIMITS.extractionPerOrg);
    const e = await db.extraction.findUnique({ where: { id } });
    if (!e) return { error: "This extraction no longer exists." };
    if (e.status === "APPROVED" || e.status === "REJECTED") return { error: "This document has already been reviewed." };
    await db.extraction.update({ where: { id }, data: { status: "QUEUED", error: null } });
    after(() => runExtraction(db, id));
    revalidatePath(`/o/${orgSlug}/extractions/${id}`);
    return { ok: true, message: "Reading the document again…" };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function rejectExtractionAction(orgSlug: string, id: string): Promise<ActionState> {
  try {
    if (!ID.test(id)) return { error: "Invalid request." };
    const { db, org, user } = await requirePermission(orgSlug, "data.write");
    const e = await db.extraction.findUnique({ where: { id } });
    if (!e) return { error: "This extraction no longer exists." };
    if (e.status === "APPROVED") return { error: "Approved extractions cannot be discarded." };
    await db.$transaction(async (tx) => {
      await tx.extraction.update({ where: { id }, data: { status: "REJECTED", reviewedById: user.id, reviewedAt: new Date() } });
      await audit(tx, { organizationId: org.id, actorId: user.id, action: "extraction.reject", entityType: "Extraction", entityId: id });
    });
    revalidatePath(`/o/${orgSlug}/extractions`);
  } catch (error) {
    return handleActionError(error);
  }
  redirect(`/o/${orgSlug}/extractions`);
}

const rowSchema = z.object({
  description: z.string().max(300),
  categoryId: z.string({ message: "Choose a category" }).regex(ID, "Choose a category"),
  quantityKg: z.string().transform((v, ctx) => {
    const n = parseNumber(v);
    if (n === null || n <= 0 || n > MAX_QUANTITY_KG) {
      ctx.addIssue({ code: "custom", message: "Enter the weight in kg" });
      return z.NEVER;
    }
    return n;
  }),
});

const invoiceHeader = z.object({
  month: z.string({ message: "Choose the month" }).transform((v, ctx) => {
    const m = parseMonth(v);
    const problem = m ? checkReportingMonth(m, new Date()) : "Choose the month";
    if (!m || problem) {
      ctx.addIssue({ code: "custom", message: problem ?? "Choose the month" });
      return z.NEVER;
    }
    return m;
  }),
  stateCode: z.enum(STATE_CODES, { message: "Choose the state" }),
  entityType: z.enum(["PRODUCER", "IMPORTER", "BRAND_OWNER"], { message: "Choose the entity type" }),
  gstRegistrationId: z
    .string()
    .optional()
    .transform((v) => (v && v !== "none" ? v : null)),
  brandId: z
    .string()
    .optional()
    .transform((v) => (v && v !== "none" ? v : null)),
});

/** Turns the reviewed invoice lines into material entries (source: AI extraction). */
export async function approveInvoiceExtractionAction(orgSlug: string, id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  let created = 0;
  try {
    if (!ID.test(id)) return { error: "Invalid request." };
    const { db, org, user } = await requirePermission(orgSlug, "data.write");
    const extraction = await db.extraction.findUnique({ where: { id } });
    if (!extraction || extraction.target !== "MATERIAL_ENTRY") return { error: "This extraction no longer exists." };
    if (extraction.status === "APPROVED") return { error: "This invoice has already been imported." };

    const header = invoiceHeader.safeParse(Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string")));
    if (!header.success) return fieldErrors(header.error);
    const h = header.data;
    if (!org.entityTypes.includes(h.entityType)) return { fieldErrors: { entityType: ["Your organisation is not registered with this entity type"] } };

    const count = Math.min(200, Number(formData.get("rowCount")) || 0);
    const rows: z.output<typeof rowSchema>[] = [];
    const errors: Record<string, string[]> = {};
    for (let i = 0; i < count; i++) {
      if (formData.get(`row-${i}-include`) !== "on") continue;
      const parsed = rowSchema.safeParse({ description: formData.get(`row-${i}-description`) ?? "", categoryId: formData.get(`row-${i}-categoryId`) ?? undefined, quantityKg: formData.get(`row-${i}-quantityKg`) ?? "" });
      if (!parsed.success) for (const issue of parsed.error.issues) errors[`row-${i}-${String(issue.path[0])}`] = [issue.message];
      else rows.push(parsed.data);
    }
    if (Object.keys(errors).length) return { error: "Please fix the highlighted lines.", fieldErrors: errors };
    if (rows.length === 0) return { error: "Select at least one line to import." };

    // References from the browser must belong to this organisation.
    const [categories, gst, brand] = await Promise.all([
      db.materialCategory.findMany({ where: { id: { in: rows.map((r) => r.categoryId) }, stream: { in: org.wasteStreams }, active: true }, select: { id: true } }),
      h.gstRegistrationId ? db.gstRegistration.findFirst({ where: { id: h.gstRegistrationId, archivedAt: null } }) : null,
      h.brandId ? db.brand.findFirst({ where: { id: h.brandId, archivedAt: null } }) : null,
    ]);
    if (categories.length !== new Set(rows.map((r) => r.categoryId)).size) return { error: "A selected category is not available for your organisation." };
    if (h.gstRegistrationId && !gst) return { fieldErrors: { gstRegistrationId: ["Choose one of your GSTINs"] } };
    if (h.brandId && !brand) return { fieldErrors: { brandId: ["Choose one of your brands"] } };

    // Lines of the same category are combined into one monthly entry.
    const byCategory = new Map<string, { kg: number; descriptions: string[] }>();
    for (const r of rows) {
      const g = byCategory.get(r.categoryId) ?? { kg: 0, descriptions: [] };
      g.kg += r.quantityKg;
      g.descriptions.push(r.description);
      byCategory.set(r.categoryId, g);
    }
    const monthKeyStr = h.month.toISOString().slice(0, 7);
    const existing = await existingEntryKeys(db, [monthKeyStr]);
    const entries = [...byCategory.entries()].map(([categoryId, g]) => ({
      organizationId: org.id,
      categoryId,
      entityType: h.entityType,
      periodMonth: h.month,
      financialYear: financialYearOf(h.month),
      stateCode: h.stateCode,
      brandId: h.brandId,
      plantId: null,
      gstRegistrationId: h.gstRegistrationId,
      quantityKg: g.kg.toFixed(3),
      source: "AI_EXTRACTION" as const,
      extractionId: id,
      notes: `From invoice: ${g.descriptions.join("; ")}`.slice(0, 500),
      createdById: user.id,
    }));
    const clash = entries.find((e) => existing.has(entryKey(e)));
    if (clash) {
      return { error: "An entry for this month, category, state and brand already exists. Edit it on the Materials page instead, or change the brand / GSTIN here." };
    }

    await db.$transaction(async (tx) => {
      await tx.materialEntry.createMany({ data: entries });
      await tx.extraction.update({
        where: { id },
        data: { status: "APPROVED", reviewedById: user.id, reviewedAt: new Date(), reviewed: { header: { ...h, month: monthKeyStr }, rows } as never },
      });
      await audit(tx, { organizationId: org.id, actorId: user.id, action: "extraction.approve", entityType: "Extraction", entityId: id, after: { entries: entries.length, totalKg: rows.reduce((s, r) => s + r.quantityKg, 0) } });
    });
    created = entries.length;
    revalidatePath(`/o/${orgSlug}`, "layout");
  } catch (error) {
    return handleActionError(error);
  }
  redirect(`/o/${orgSlug}/materials?source=AI_EXTRACTION&imported=${created}`);
}
