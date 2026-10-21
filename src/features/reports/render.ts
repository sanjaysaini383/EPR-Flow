import "server-only";
import { createHash } from "node:crypto";
import type { OrgContext } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import type { ReportDocument } from "@/lib/domain/reports/types";
import { renderCsv } from "@/lib/reports/csv";
import { renderPdf } from "@/lib/reports/pdf";
import { renderXlsx } from "@/lib/reports/xlsx";
import { CONTENT_TYPES, type ReportFormat } from "./service";

type ReportType = "CPCB_ANNUAL_RETURN" | "OBLIGATION_SUMMARY" | "CERTIFICATE_REGISTER" | "MATERIAL_REGISTER" | "AUDIT_EXPORT";

/**
 * Renders a report, records it in the report history and audit log, and returns
 * the download response. The SHA-256 lets anyone match a shared copy to this record.
 */
export async function reportResponse(
  ctx: OrgContext,
  doc: ReportDocument,
  meta: { type: ReportType; financialYear: string | null; format: ReportFormat; fileName: string },
): Promise<Response> {
  const body: Uint8Array =
    meta.format === "pdf" ? await renderPdf(doc) : meta.format === "xlsx" ? await renderXlsx(doc) : new TextEncoder().encode(renderCsv(doc));
  const sha256 = createHash("sha256").update(body).digest("hex");

  const report = await ctx.db.report.create({
    data: {
      organizationId: ctx.org.id,
      type: meta.type,
      financialYear: meta.financialYear,
      format: meta.format.toUpperCase(),
      fileName: meta.fileName,
      sha256,
      sizeBytes: body.byteLength,
      generatedById: ctx.user.id,
    },
  });
  await audit(ctx.db, {
    organizationId: ctx.org.id,
    actorId: ctx.user.id,
    action: "report.generate",
    entityType: "Report",
    entityId: report.id,
    after: { type: meta.type, financialYear: meta.financialYear, format: meta.format, sha256 },
  });

  return new Response(body as BodyInit, {
    headers: {
      "Content-Type": CONTENT_TYPES[meta.format],
      "Content-Disposition": `attachment; filename="${meta.fileName}"`,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Report-Sha256": sha256,
    },
  });
}
