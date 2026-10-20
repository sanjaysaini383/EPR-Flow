import { notFound } from "next/navigation";
import type { StoredErrors } from "@/features/materials/import-actions";
import { getOrgContext } from "@/lib/auth/session";
import { toSafeCsv } from "@/lib/files/spreadsheet";

/** The rows that failed validation, with an "errors" column — fix and re-upload. */
export async function GET(_request: Request, { params }: RouteContext<"/o/[orgSlug]/materials/import/[batchId]/errors">) {
  const { orgSlug, batchId } = await params;
  const { db } = await getOrgContext(orgSlug);
  const batch = await db.importBatch.findUnique({ where: { id: batchId } });
  if (!batch) notFound();

  const stored = (batch.errors ?? { items: [], failedRows: [], headers: [] }) as StoredErrors;
  const headers = [...stored.headers, "errors"];
  const base = batch.fileName.replace(/\.(csv|xlsx)$/i, "").replace(/[^\w.-]+/g, "_").slice(0, 80) || "import";

  return new Response(toSafeCsv(stored.failedRows, headers), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${base}-errors.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
