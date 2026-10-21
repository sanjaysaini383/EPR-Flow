import { z } from "zod";
import { reportResponse } from "@/features/reports/render";
import { buildReport, REPORT_KINDS, reportFileName, type ReportKind } from "@/features/reports/service";
import { getOrgContext } from "@/lib/auth/session";
import { isFinancialYear } from "@/lib/domain/financial-year";
import { RateLimitError, rateLimit, LIMITS } from "@/lib/security/rate-limit";

const querySchema = z.object({
  kind: z.enum(Object.keys(REPORT_KINDS) as [ReportKind, ...ReportKind[]]),
  fy: z.string().refine(isFinancialYear),
  format: z.enum(["xlsx", "pdf", "csv"]),
});

/** GET /o/[org]/reports/download?kind=annual-return&fy=2025-26&format=xlsx */
export async function GET(request: Request, { params }: RouteContext<"/o/[orgSlug]/reports/download">) {
  const { orgSlug } = await params;
  const ctx = await getOrgContext(orgSlug);
  if (!ctx.can("reports.export")) return Response.json({ error: "Your role cannot export reports." }, { status: 403 });

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return Response.json({ error: "Choose a report, a financial year and a format." }, { status: 400 });
  const { kind, fy, format } = parsed.data;
  const spec = REPORT_KINDS[kind];
  if (!(spec.formats as readonly string[]).includes(format)) {
    return Response.json({ error: `${spec.title} is available as ${spec.formats.map((f) => f.toUpperCase()).join(" or ")}.` }, { status: 400 });
  }

  try {
    await rateLimit(`report:${ctx.user.id}`, LIMITS.reportPerUser);
  } catch (error) {
    if (error instanceof RateLimitError) {
      return Response.json({ error: error.message }, { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } });
    }
    throw error;
  }

  const now = new Date();
  const doc = await buildReport(ctx, kind, fy, now);
  return reportResponse(ctx, doc, { type: spec.type, financialYear: fy, format, fileName: reportFileName(orgSlug, kind, fy, format, now) });
}
