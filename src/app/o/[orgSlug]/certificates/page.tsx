import { FileCheck2Icon, FlagIcon, PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { FySelect } from "@/components/app/fy-select";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CertificateStatusBadge } from "@/features/certificates/status-badge";
import { TYPE_LABELS } from "@/features/certificates/service";
import { getOrgContext } from "@/lib/auth/session";
import { financialYearOf, isFinancialYear, recentFinancialYears } from "@/lib/domain/financial-year";
import { formatTonnes } from "@/lib/domain/units";
import { formatInr } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Certificates" };

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "PENDING_APPROVAL", label: "Awaiting approval" },
  { value: "APPROVED", label: "Approved" },
  { value: "DRAFT", label: "Drafts" },
  { value: "REJECTED", label: "Rejected" },
];
const dateFormat = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const short = (name: string) => name.split(" – ")[0];

export default async function CertificatesPage({ params, searchParams }: PageProps<"/o/[orgSlug]/certificates">) {
  const { orgSlug } = await params;
  const { fy: rawFy, status: rawStatus } = await searchParams;
  const { db, can } = await getOrgContext(orgSlug);
  const fy = typeof rawFy === "string" && isFinancialYear(rawFy) ? rawFy : financialYearOf(new Date());
  const status = STATUS_FILTERS.some((s) => s.value === rawStatus) ? (rawStatus as string) : "all";
  const showCosts = can("costs.view");
  const base = `/o/${orgSlug}/certificates`;

  const [certificates, counts, approved] = await Promise.all([
    db.certificate.findMany({
      where: { deletedAt: null, financialYear: fy, ...(status !== "all" ? { status: status as never } : {}) },
      include: {
        recycler: { select: { name: true, verificationStatus: true } },
        category: { select: { name: true } },
        flags: { where: { status: "OPEN" }, select: { severity: true } },
      },
      orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
      take: 300,
    }),
    db.certificate.groupBy({ by: ["status"], where: { deletedAt: null, financialYear: fy }, _count: true }),
    db.certificate.groupBy({ by: ["type"], where: { deletedAt: null, financialYear: fy, status: "APPROVED" }, _sum: { quantityKg: true, costInr: true } }),
  ]);
  const count = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const approvedKg = (t: string) => Number(approved.find((a) => a.type === t)?._sum.quantityKg ?? 0);
  const spend = approved.reduce((sum, a) => sum + Number(a._sum.costInr ?? 0), 0);
  const flagged = certificates.filter((c) => c.flags.some((f) => f.severity === "HIGH")).length;
  const query = (s: string) => `${base}?fy=${fy}${s === "all" ? "" : `&status=${s}`}`;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="EPR certificates"
        description={`Certificates bought from recyclers for FY ${fy}. Every certificate is checked for duplicates, recycler status, capacity, dates and price.`}
        actions={
          <>
            <FySelect years={recentFinancialYears(new Date(), 4)} value={fy} />
            {can("certificates.write") && (
              <Button asChild>
                <Link href={`${base}/new`}>
                  <PlusIcon /> Add certificate
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Approved — recycling" value={formatTonnes(approvedKg("RECYCLING"))} />
        <Stat label="Approved — end of life" value={formatTonnes(approvedKg("END_OF_LIFE"))} />
        <Stat label="Awaiting approval" value={String(count("PENDING_APPROVAL"))} href={query("PENDING_APPROVAL")} />
        {showCosts ? <Stat label="Spend (approved)" value={formatInr(spend)} /> : <Stat label="With high-severity flags" value={String(flagged)} />}
      </div>

      <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) => (
          <Link
            key={s.value}
            href={query(s.value)}
            aria-current={status === s.value ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors hover:bg-muted",
              status === s.value && "border-primary bg-brand-soft font-medium text-primary",
            )}
          >
            {s.label}
            {s.value !== "all" && <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">{count(s.value)}</span>}
          </Link>
        ))}
      </nav>

      {certificates.length === 0 ? (
        <EmptyState
          icon={<FileCheck2Icon />}
          title={status === "all" ? `No certificates for FY ${fy}` : "Nothing matches this filter"}
          description="Add each EPR certificate you buy. EPRFlow checks it against the recycler directory and every other certificate on the platform."
          action={
            can("certificates.write") ? (
              <Button asChild>
                <Link href={`${base}/new`}>
                  <PlusIcon /> Add certificate
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Certificate no.</TableHead>
                  <TableHead>Recycler</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  {showCosts && <TableHead className="text-right">Cost</TableHead>}
                  <TableHead>Status</TableHead>
                  <TableHead>Checks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {certificates.map((c) => {
                  const high = c.flags.filter((f) => f.severity === "HIGH").length;
                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Link href={`${base}/${c.id}`} className="font-mono text-sm font-medium underline-offset-4 hover:underline">
                          {c.certificateNumber}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-56 truncate">{c.recycler.name}</TableCell>
                      <TableCell>{short(c.category.name)}</TableCell>
                      <TableCell>{TYPE_LABELS[c.type]}</TableCell>
                      <TableCell className="tabular-nums">{dateFormat.format(c.issueDate)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatTonnes(c.quantityKg.toString())}</TableCell>
                      {showCosts && <TableCell className="text-right tabular-nums">{c.costInr ? formatInr(c.costInr.toString()) : "—"}</TableCell>}
                      <TableCell>
                        <CertificateStatusBadge status={c.status} />
                      </TableCell>
                      <TableCell>
                        {c.flags.length === 0 ? (
                          <span className="text-xs text-muted-foreground">Clear</span>
                        ) : (
                          <Badge variant="outline" className={cn("gap-1", high ? "border-status-critical/50 text-status-critical" : "border-status-warning/60")}>
                            <FlagIcon className="size-3" aria-hidden />
                            {c.flags.length} open{high ? ` · ${high} high` : ""}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, href }: { label: string; value: string; href?: string }) {
  const card = (
    <Card className="h-full gap-2">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
  return href ? (
    <Link href={href} className="rounded-xl transition-shadow hover:shadow-md">
      {card}
    </Link>
  ) : (
    card
  );
}
