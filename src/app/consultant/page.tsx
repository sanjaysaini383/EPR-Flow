import { ArrowRightIcon, Building2Icon, CalendarClockIcon, FlagIcon, OctagonAlertIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { Logo } from "@/components/app/logo";
import { PageHeader } from "@/components/app/page-header";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { loadClientSummaries } from "@/features/consultant/overview";
import { StatusBadge } from "@/features/compliance/components/status-badge";
import { listUserOrganizations, requireUser } from "@/lib/auth/session";
import { formatDueDate } from "@/lib/domain/deadlines/messages";
import { daysUntil, describeDaysLeft } from "@/lib/domain/deadlines/schedule";
import { financialYearOf } from "@/lib/domain/financial-year";
import { ROLE_LABELS } from "@/lib/domain/permissions";
import { formatTonnes } from "@/lib/domain/units";
import { formatInrCompact, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "All clients" };

const STATUS_ORDER: Record<string, number> = { AT_RISK: 0, SHORTFALL: 1, BEHIND: 2, ON_TRACK: 3, MET: 4, NO_RULE: 5, NO_OBLIGATION: 6 };

export default async function ConsultantPage() {
  const user = await requireUser("/consultant");
  const orgs = await listUserOrganizations(user.id);
  const now = new Date();
  const clients = (await loadClientSummaries(orgs, now)).sort(
    (a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) || (a.score ?? 2) - (b.score ?? 2),
  );
  const attention = clients.filter((c) => c.status === "AT_RISK" || c.overdueDeadlines > 0 || c.highFlags > 0).length;
  const pending = clients.reduce((s, c) => s + c.pendingApprovals, 0);
  const ec = clients.reduce((s, c) => s + (c.ecRiskInr ?? 0), 0);

  return (
    <div className="min-h-svh">
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur sm:px-6">
        <Link href="/consultant" aria-label="All clients">
          <Logo />
        </Link>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="hidden sm:inline">{user.email}</span>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto grid max-w-7xl gap-6 p-4 sm:p-6">
        <PageHeader title="All clients" description={`Compliance across every company you work with, FY ${financialYearOf(now)}. Clients needing attention are listed first.`} />

        {clients.length === 0 ? (
          <EmptyState
            icon={<Building2Icon />}
            title="No client companies yet"
            description="Ask a client's Admin to invite you as a Consultant, or create a company."
            action={
              <Button asChild>
                <Link href="/onboarding">Create a company</Link>
              </Button>
            }
          />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Client companies" value={String(clients.length)} />
              <Stat label="Need attention" value={String(attention)} tone={attention ? "text-status-critical" : undefined} />
              <Stat label="Certificates awaiting approval" value={String(pending)} />
              <Stat label="EC risk across clients" value={formatInrCompact(ec)} />
            </div>

            <Card>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Company</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Fulfilled</TableHead>
                        <TableHead className="text-right">Remaining</TableHead>
                        <TableHead className="text-right">EC risk</TableHead>
                        <TableHead>Needs attention</TableHead>
                        <TableHead>Next deadline</TableHead>
                        <TableHead className="sr-only">Open</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {clients.map((c) => (
                        <TableRow key={c.id} className="align-top">
                          <TableCell>
                            <Link href={`/o/${c.slug}/dashboard`} className="font-medium underline-offset-4 hover:underline">
                              {c.name}
                            </Link>
                            <div className="text-xs text-muted-foreground">{ROLE_LABELS[c.role]}</div>
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={c.status} />
                            {c.atRisk.length > 0 && <div className="mt-1 text-xs text-muted-foreground">{c.atRisk.join(", ")}</div>}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{formatPercent(c.score)}</TableCell>
                          <TableCell className="text-right tabular-nums">{c.targetKg > 0 ? formatTonnes(c.remainingKg) : "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{c.ecRiskInr === null ? <span className="text-xs text-muted-foreground">Hidden</span> : formatInrCompact(c.ecRiskInr)}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {c.criticalAlerts > 0 && (
                                <Badge variant="outline" className="gap-1 border-status-critical/50">
                                  <OctagonAlertIcon className="size-3 text-status-critical" aria-hidden /> {c.criticalAlerts} critical alert{c.criticalAlerts === 1 ? "" : "s"}
                                </Badge>
                              )}
                              {c.highFlags > 0 && (
                                <Badge variant="outline" className="gap-1 border-status-critical/50">
                                  <FlagIcon className="size-3 text-status-critical" aria-hidden /> {c.highFlags} high flag{c.highFlags === 1 ? "" : "s"}
                                </Badge>
                              )}
                              {c.pendingApprovals > 0 && <Badge variant="outline">{c.pendingApprovals} to approve</Badge>}
                              {c.overdueDeadlines > 0 && (
                                <Badge variant="outline" className="gap-1 border-status-critical/50">
                                  <CalendarClockIcon className="size-3 text-status-critical" aria-hidden /> {c.overdueDeadlines} overdue
                                </Badge>
                              )}
                              {c.criticalAlerts + c.highFlags + c.pendingApprovals + c.overdueDeadlines === 0 && <span className="text-xs text-muted-foreground">Nothing</span>}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            {c.nextDeadline ? (
                              <>
                                <div className="max-w-56 truncate" title={c.nextDeadline.title}>
                                  {c.nextDeadline.title}
                                </div>
                                <div className={cn("text-xs text-muted-foreground", daysUntil(c.nextDeadline.dueDate, now) <= 14 && "text-status-warning")}>
                                  {formatDueDate(c.nextDeadline.dueDate)} · {describeDaysLeft(daysUntil(c.nextDeadline.dueDate, now))}
                                </div>
                              </>
                            ) : (
                              <span className="text-xs text-muted-foreground">None open</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button asChild variant="ghost" size="icon-sm" aria-label={`Open ${c.name}`}>
                              <Link href={`/o/${c.slug}/dashboard`}>
                                <ArrowRightIcon />
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <Card className="gap-2">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className={cn("text-2xl font-semibold tabular-nums", tone)}>{value}</p>
      </CardContent>
    </Card>
  );
}
