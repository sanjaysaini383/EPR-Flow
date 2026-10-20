"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { EntityType } from "@/generated/prisma/enums";
import { handleActionError, type ActionState } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/session";
import { errorRowsForDownload, validateImport, type NormalisedRow, type RowError } from "@/lib/domain/materials/import";
import { parseSpreadsheet, SpreadsheetError } from "@/lib/files/spreadsheet";
import { LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { entryKey, existingEntryKeys, loadMaterialContext } from "./queries";

export type StoredErrors = { items: RowError[]; failedRows: Record<string, unknown>[]; headers: string[] };
type StoredRow = { row: number; data: NormalisedRow };

/** Step 1: parse + validate the upload and store the result for preview. Nothing is imported yet. */
export async function uploadImportAction(orgSlug: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  let batchId: string;
  try {
    const { db, org, user } = await requirePermission(orgSlug, "data.write");
    await rateLimit(`import:org:${org.id}`, LIMITS.importPerOrg);

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { fieldErrors: { file: ["Choose a CSV or Excel file to upload"] } };

    const sheet = await parseSpreadsheet(file);
    const ctx = await loadMaterialContext(db, org);
    const result = validateImport(sheet.rows, sheet.headers, ctx);
    if (result.fileErrors.length) return { fieldErrors: { file: result.fileErrors } };

    // Rows that duplicate data already in EPRFlow would double-count quantities.
    const existing = await existingEntryKeys(db, result.valid.map((v) => v.data.periodMonth));
    const valid: StoredRow[] = [];
    const errors = [...result.errors];
    for (const v of result.valid) {
      if (existing.has(entryKey(v.data))) {
        errors.push({ row: v.row, column: "month", message: "Already entered in EPRFlow for this month, category, state, brand and plant" });
      } else valid.push(v);
    }
    errors.sort((a, b) => a.row - b.row);

    const stored: StoredErrors = {
      items: errors,
      failedRows: errorRowsForDownload(sheet.rows, errors),
      headers: sheet.headers,
    };
    const errorRowCount = new Set(errors.map((e) => e.row)).size;

    const batch = await db.$transaction(async (tx) => {
      const batch = await tx.importBatch.create({
        data: {
          organizationId: org.id,
          fileName: file.name.slice(0, 200),
          fileSha256: sheet.sha256,
          status: "VALIDATED",
          totalRows: result.totalRows,
          validRows: valid.length,
          errorRows: errorRowCount,
          rows: JSON.parse(JSON.stringify(valid)),
          errors: JSON.parse(JSON.stringify(stored)),
          createdById: user.id,
        },
      });
      await audit(tx, {
        organizationId: org.id,
        actorId: user.id,
        action: "import.upload",
        entityType: "ImportBatch",
        entityId: batch.id,
        after: { fileName: file.name, totalRows: result.totalRows, validRows: valid.length, errorRows: errorRowCount },
      });
      return batch;
    });
    batchId = batch.id;
  } catch (error) {
    if (error instanceof SpreadsheetError) return { fieldErrors: { file: [error.message] } };
    return handleActionError(error);
  }
  redirect(`/o/${orgSlug}/materials/import/${batchId}`);
}

/** Step 2: insert the valid rows. Re-checks duplicates in case data changed since the preview. */
export async function commitImportAction(orgSlug: string, batchId: string): Promise<ActionState> {
  try {
    const { db, org, user } = await requirePermission(orgSlug, "data.write");
    const batch = await db.importBatch.findUnique({ where: { id: batchId } });
    if (!batch) return { error: "Import not found." };
    if (batch.status !== "VALIDATED") return { error: "This import has already been processed." };

    const rows = (batch.rows ?? []) as StoredRow[];
    if (rows.length === 0) return { error: "There are no valid rows to import." };

    // Ids in the stored rows were resolved at upload time; re-verify they still belong to
    // this organisation and are active before writing anything.
    const ctx = await loadMaterialContext(db, org);
    const ok = (set: { id: string }[], id: string | null) => id === null || set.some((x) => x.id === id);
    const stale = rows.filter(
      ({ data: d }) => !ok(ctx.categories, d.categoryId) || !ok(ctx.brands, d.brandId) || !ok(ctx.plants, d.plantId) || !ok(ctx.gstins, d.gstRegistrationId),
    );
    if (stale.length) return { error: "Some brands, plants or GSTINs in this file were archived since the upload. Upload the file again." };

    const existing = await existingEntryKeys(db, rows.map((r) => r.data.periodMonth));
    const duplicates = rows.filter((r) => existing.has(entryKey(r.data)));
    if (duplicates.length) {
      return { error: `${duplicates.length} row(s) were entered by someone else since the upload. Upload the file again to re-check.` };
    }

    await db.$transaction(async (tx) => {
      // Claim the batch first so a double-click cannot import twice.
      const claimed = await tx.importBatch.updateMany({
        where: { id: batchId, status: "VALIDATED" },
        data: { status: "COMMITTED", committedAt: new Date() },
      });
      if (claimed.count === 0) throw new AlreadyCommitted();

      await tx.materialEntry.createMany({
        data: rows.map(({ data }) => ({
          ...data,
          entityType: data.entityType as EntityType,
          periodMonth: new Date(`${data.periodMonth}T00:00:00Z`),
          organizationId: org.id,
          source: "IMPORT" as const,
          importBatchId: batchId,
          createdById: user.id,
        })),
      });
      await audit(tx, {
        organizationId: org.id,
        actorId: user.id,
        action: "import.commit",
        entityType: "ImportBatch",
        entityId: batchId,
        after: { importedRows: rows.length, fileName: batch.fileName },
      });
    }, { timeout: 30_000 });

    revalidatePath(`/o/${orgSlug}/materials`);
    revalidatePath(`/o/${orgSlug}/dashboard`);
    return { ok: true, message: `Imported ${rows.length} row${rows.length === 1 ? "" : "s"}.` };
  } catch (error) {
    if (error instanceof AlreadyCommitted) return { error: "This import has already been processed." };
    return handleActionError(error);
  }
}

export async function discardImportAction(orgSlug: string, batchId: string): Promise<ActionState> {
  try {
    const { db, org, user } = await requirePermission(orgSlug, "data.write");
    await db.$transaction(async (tx) => {
      const { count } = await tx.importBatch.updateMany({
        where: { id: batchId, status: "VALIDATED" },
        data: { status: "FAILED", rows: undefined },
      });
      if (count === 0) throw new AlreadyCommitted();
      await audit(tx, { organizationId: org.id, actorId: user.id, action: "import.discard", entityType: "ImportBatch", entityId: batchId });
    });
    revalidatePath(`/o/${orgSlug}/materials/import`);
    return { ok: true, message: "Import discarded." };
  } catch (error) {
    if (error instanceof AlreadyCommitted) return { error: "This import has already been processed." };
    return handleActionError(error);
  }
}

class AlreadyCommitted extends Error {}
