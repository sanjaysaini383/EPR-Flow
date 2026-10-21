import { auditWhere, parseAuditFilters } from "@/features/audit/filters";
import { reportResponse } from "@/features/reports/render";
import { reportFileName } from "@/features/reports/service";
import { getOrgContext } from "@/lib/auth/session";
import { buildAuditExport } from "@/lib/domain/reports/build";
import { LIMITS, RateLimitError, rateLimit } from "@/lib/security/rate-limit";

const MAX_ROWS = 20_000;

/** GET /o/[org]/audit-log/export?format=csv&entity=&actor=&from=&to= — same filters as the page. */
export async function GET(request: Request, { params }: RouteContext<"/o/[orgSlug]/audit-log/export">) {
  const { orgSlug } = await params;
  const ctx = await getOrgContext(orgSlug);
  if (!ctx.can("audit.view")) return Response.json({ error: "Your role does not have access to the audit log." }, { status: 403 });

  const search = new URL(request.url).searchParams;
  const format = search.get("format") === "xlsx" ? "xlsx" : "csv";
  const filters = parseAuditFilters(Object.fromEntries(search));

  try {
    await rateLimit(`report:${ctx.user.id}`, LIMITS.reportPerUser);
  } catch (error) {
    if (error instanceof RateLimitError) return Response.json({ error: error.message }, { status: 429 });
    throw error;
  }

  const entries = await ctx.db.auditLog.findMany({
    where: auditWhere(filters),
    orderBy: { createdAt: "desc" },
    take: MAX_ROWS,
    include: { actor: { select: { name: true, email: true } } },
  });
  const parts = [
    filters.entity && `record type ${filters.entity}`,
    filters.from && `from ${filters.from}`,
    filters.to && `to ${filters.to}`,
    filters.actor && "one user",
  ].filter(Boolean);
  const now = new Date();
  const doc = buildAuditExport({
    organizationName: ctx.org.legalName || ctx.org.name,
    generatedAt: now,
    filterLabel: parts.length ? `Filtered: ${parts.join(", ")}` : "All activity",
    entries: entries.map((e) => ({
      createdAt: e.createdAt,
      actorName: e.actor?.name ?? null,
      actorEmail: e.actor?.email ?? null,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId,
      ip: e.ip,
      before: e.before,
      after: e.after,
    })),
  });
  return reportResponse(ctx, doc, { type: "AUDIT_EXPORT", financialYear: null, format, fileName: reportFileName(orgSlug, "audit-log", null, format, now) });
}
