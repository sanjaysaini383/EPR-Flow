import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getOrgContext } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Audit log" };

const PAGE_SIZE = 50;
const timeFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

export default async function AuditLogPage({ params, searchParams }: PageProps<"/o/[orgSlug]/audit-log">) {
  const { orgSlug } = await params;
  const { page: rawPage } = await searchParams;
  const { db, can } = await getOrgContext(orgSlug);

  if (!can("audit.view")) {
    return (
      <div className="grid gap-6">
        <PageHeader title="Audit log" />
        <p className="text-sm text-muted-foreground">Your role does not have access to the audit log.</p>
      </div>
    );
  }

  const page = Math.max(1, Number(rawPage) || 1);
  const [entries, total] = await Promise.all([
    db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { actor: { select: { name: true, email: true } } },
    }),
    db.auditLog.count(),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="grid gap-6">
      <PageHeader title="Audit log" description="Every change in this organization, who made it and when." />
      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-44">When (IST)</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Record</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                    No activity yet.
                  </TableCell>
                </TableRow>
              )}
              {entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-muted-foreground tabular-nums">{timeFormat.format(e.createdAt)}</TableCell>
                  <TableCell>{e.actor?.name ?? e.actor?.email ?? "System"}</TableCell>
                  <TableCell>
                    <code className="text-xs">{e.action}</code>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {e.entityType} <span className="font-mono text-xs">{e.entityId.slice(-8)}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <span className="text-muted-foreground">
            Page {page} of {pages}
          </span>
          <Button asChild variant="outline" size="sm" disabled={page <= 1}>
            <Link href={`?page=${page - 1}`} aria-disabled={page <= 1} className={page <= 1 ? "pointer-events-none opacity-50" : ""}>
              Previous
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`?page=${page + 1}`} aria-disabled={page >= pages} className={page >= pages ? "pointer-events-none opacity-50" : ""}>
              Next
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
