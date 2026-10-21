import { FileSpreadsheetIcon, FileTextIcon, HistoryIcon, ScrollTextIcon, ShieldCheckIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FySelect } from "@/components/app/fy-select";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DownloadButton } from "@/features/reports/download-button";
import { REPORT_KINDS, type ReportKind } from "@/features/reports/service";
import { getOrgContext } from "@/lib/auth/session";
import { financialYearOf, formatFinancialYear, isFinancialYear, parseFinancialYear, recentFinancialYears } from "@/lib/domain/financial-year";

export const metadata: Metadata = { title: "Reports" };

const TYPE_LABELS: Record<string, string> = {
  CPCB_ANNUAL_RETURN: "CPCB annual return",
  OBLIGATION_SUMMARY: "Obligation summary",
  MATERIAL_REGISTER: "Material register",
  CERTIFICATE_REGISTER: "Certificate register",
  AUDIT_EXPORT: "Audit log export",
};
const ICONS: Record<ReportKind, typeof FileTextIcon> = {
  "annual-return": ScrollTextIcon,
  "obligation-summary": FileTextIcon,
  "material-register": FileSpreadsheetIcon,
  "certificate-register": ShieldCheckIcon,
};
const timeFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

function formatBytes(n: number) {
  return n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default async function ReportsPage({ params, searchParams }: PageProps<"/o/[orgSlug]/reports">) {
  const { orgSlug } = await params;
  const { fy: rawFy } = await searchParams;
  const { db, can } = await getOrgContext(orgSlug);

  // Annual returns are filed for the year just ended, so that is the default.
  const now = new Date();
  const previousFy = formatFinancialYear(parseFinancialYear(financialYearOf(now)).startYear - 1);
  const fy = typeof rawFy === "string" && isFinancialYear(rawFy) ? rawFy : previousFy;
  const years = recentFinancialYears(now, 4);

  const history = await db.report.findMany({ orderBy: { createdAt: "desc" }, take: 15 });
  const people = await db.membership.findMany({
    where: { userId: { in: [...new Set(history.map((r) => r.generatedById))] } },
    select: { userId: true, user: { select: { name: true, email: true } } },
  });
  const nameOf = new Map(people.map((p) => [p.userId, p.user.name ?? p.user.email]));

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Reports"
        description={`Generated from live data for FY ${fy}. Every download is recorded below and in the audit log.`}
        actions={<FySelect years={years} value={fy} />}
      />

      <div className="grid gap-4 md:grid-cols-2">
        {(Object.entries(REPORT_KINDS) as [ReportKind, (typeof REPORT_KINDS)[ReportKind]][]).map(([kind, spec]) => {
          const Icon = ICONS[kind];
          return (
            <Card key={kind} className="justify-between">
              <CardHeader className="flex flex-row items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-primary">
                  <Icon className="size-5" aria-hidden />
                </span>
                <div className="grid gap-1">
                  <CardTitle>{spec.title}</CardTitle>
                  <CardDescription>{spec.description}</CardDescription>
                </div>
              </CardHeader>
              <CardFooter className="flex flex-wrap gap-2">
                {spec.formats.map((format, i) => (
                  <DownloadButton
                    key={format}
                    variant={i === 0 ? "default" : "outline"}
                    href={`/o/${orgSlug}/reports/download?kind=${kind}&fy=${fy}&format=${format}`}
                    label={`${format.toUpperCase()} · FY ${fy}`}
                  />
                ))}
              </CardFooter>
            </Card>
          );
        })}
      </div>

      {can("audit.view") && (
        <Card className="gap-3 py-4">
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid gap-0.5">
              <span className="font-medium">Audit log export</span>
              <span className="text-sm text-muted-foreground">Filter by record type, person and date on the audit log page, then export as CSV or Excel.</span>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href={`/o/${orgSlug}/audit-log`}>Open audit log</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HistoryIcon className="size-4" aria-hidden /> Report history
          </CardTitle>
          <CardDescription>The fingerprint (SHA-256) lets you confirm that a shared file is exactly the one generated here.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Report</TableHead>
                <TableHead>FY</TableHead>
                <TableHead>Format</TableHead>
                <TableHead>Generated by</TableHead>
                <TableHead>When (IST)</TableHead>
                <TableHead className="text-right">Size</TableHead>
                <TableHead>Fingerprint</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    No reports generated yet.
                  </TableCell>
                </TableRow>
              )}
              {history.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{TYPE_LABELS[r.type] ?? r.type}</TableCell>
                  <TableCell>{r.financialYear ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{r.format}</Badge>
                  </TableCell>
                  <TableCell>{nameOf.get(r.generatedById) ?? "Former member"}</TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">{timeFormat.format(r.createdAt)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatBytes(r.sizeBytes)}</TableCell>
                  <TableCell>
                    <code className="text-xs text-muted-foreground" title={r.sha256}>
                      {r.sha256.slice(0, 12)}…
                    </code>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
