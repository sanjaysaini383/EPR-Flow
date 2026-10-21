import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AuditFilterControls } from "@/features/audit/filter-controls";
import { auditWhere, filterQuery, parseAuditFilters } from "@/features/audit/filters";
import { DownloadButton } from "@/features/reports/download-button";
import { getOrgContext } from "@/lib/auth/session";
import { diffChanges } from "@/lib/domain/reports/build";

export const metadata: Metadata = { title: "Audit log" };

const PAGE_SIZE = 50;
const timeFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

/** "MaterialEntry" → "Material entry" */
const entityLabel = (t: string) => t.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase()).replace(/ ([A-Z])/g, (m) => m.toLowerCase());

export default async function AuditLogPage({ params, searchParams }: PageProps<"/o/[orgSlug]/audit-log">) {
  const { orgSlug } = await params;
  const search = await searchParams;
  const { db, can } = await getOrgContext(orgSlug);

  if (!can("audit.view")) {
    return (
      <div className="grid gap-6">
        <PageHeader title="Audit log" />
        <p className="text-sm text-muted-foreground">Your role does not have access to the audit log.</p>
      </div>
    );
  }

  const filters = parseAuditFilters(search);
  const where = auditWhere(filters);
  const query = filterQuery(filters);
  const rawPage = Array.isArray(search.page) ? search.page[0] : search.page;
  const page = Math.max(1, Math.min(10_000, Number(rawPage) || 1));

  const [entries, total, entityTypes, members] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { actor: { select: { name: true, email: true } } },
    }),
    db.auditLog.count({ where }),
    db.auditLog.groupBy({ by: ["entityType"], orderBy: { entityType: "asc" } }),
    db.membership.findMany({ select: { userId: true, user: { select: { name: true, email: true } } }, orderBy: { createdAt: "asc" } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (p: number) => `?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(query)), page: String(p) }).toString()}`;
  const exportHref = (format: string) => `/o/${orgSlug}/audit-log/export?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(query)), format }).toString()}`;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Audit log"
        description="Every change in this organization, who made it and when."
        actions={
          <>
            <DownloadButton href={exportHref("csv")} label="Export CSV" />
            <DownloadButton href={exportHref("xlsx")} label="Excel" />
          </>
        }
      />
      <AuditFilterControls
        key={query}
        entities={entityTypes.map((e) => ({ value: e.entityType, label: entityLabel(e.entityType) }))}
        people={members.map((m) => ({ value: m.userId, label: m.user.name ?? m.user.email }))}
      />
      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-44">When (IST)</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Record</TableHead>
                <TableHead>Changes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    {query ? "No activity matches these filters." : "No activity yet."}
                  </TableCell>
                </TableRow>
              )}
              {entries.map((e) => {
                const changes = diffChanges(e.before, e.after);
                return (
                  <TableRow key={e.id} className="align-top">
                    <TableCell className="text-muted-foreground tabular-nums">{timeFormat.format(e.createdAt)}</TableCell>
                    <TableCell>
                      <div>{e.actor?.name ?? e.actor?.email ?? "System"}</div>
                      {e.ip && <div className="font-mono text-xs text-muted-foreground">{e.ip}</div>}
                    </TableCell>
                    <TableCell>
                      <code className="text-xs">{e.action}</code>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {entityLabel(e.entityType)} <span className="font-mono text-xs">{e.entityId.slice(-8)}</span>
                    </TableCell>
                    <TableCell className="max-w-md whitespace-normal">
                      {changes.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <details className="group text-xs">
                          <summary className="cursor-pointer text-primary underline-offset-4 hover:underline">
                            {changes.length} field{changes.length === 1 ? "" : "s"}
                          </summary>
                          <dl className="mt-2 grid gap-1.5">
                            {changes.map((c) => (
                              <div key={c.field} className="grid gap-0.5">
                                <dt className="font-medium">{c.field}</dt>
                                <dd className="break-all text-muted-foreground">
                                  {c.before !== "—" && <span className="line-through decoration-status-critical/60">{c.before}</span>}
                                  {c.before !== "—" && " → "}
                                  <span className="text-foreground">{c.after}</span>
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </details>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <span className="text-muted-foreground">
            Page {page} of {pages} · {total} entries
          </span>
          <Button asChild variant="outline" size="sm">
            <Link href={pageHref(page - 1)} aria-disabled={page <= 1} className={page <= 1 ? "pointer-events-none opacity-50" : ""}>
              Previous
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={pageHref(page + 1)} aria-disabled={page >= pages} className={page >= pages ? "pointer-events-none opacity-50" : ""}>
              Next
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
