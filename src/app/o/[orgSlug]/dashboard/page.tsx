import {
  ArrowRightIcon,
  BellIcon,
  CheckCircle2Icon,
  CircleIcon,
  InfoIcon,
  OctagonAlertIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MonthlyChart, type MonthlyRow } from "@/features/compliance/components/monthly-chart";
import { ObligationBars } from "@/features/compliance/components/obligation-bars";
import { StatusBadge } from "@/features/compliance/components/status-badge";
import { computeCompliance, syncCompliance } from "@/features/compliance/service";
import { getOrgContext } from "@/lib/auth/session";
import { financialYearOf, formatMonth } from "@/lib/domain/financial-year";
import type { ObligationStatus } from "@/lib/domain/obligations/calculate";
import { formatTonnes } from "@/lib/domain/units";
import { formatInr, formatInrCompact, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

const SEVERITY: Record<string, { icon: LucideIcon; tone: string; label: string }> = {
  CRITICAL: { icon: OctagonAlertIcon, tone: "text-status-critical", label: "Critical" },
  WARNING: { icon: TriangleAlertIcon, tone: "text-status-warning", label: "Warning" },
  INFO: { icon: InfoIcon, tone: "text-muted-foreground", label: "Info" },
};
const short = (name: string) => name.split(" – ")[0];

export default async function DashboardPage({ params }: PageProps<"/o/[orgSlug]/dashboard">) {
  const { orgSlug } = await params;
  const { org, db, user, can } = await getOrgContext(orgSlug);
  const base = `/o/${org.slug}`;

  const now = new Date();
  const fy = financialYearOf(now);
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 12, 1));

  const [result, gstCount, brandCount, memberCount, materialCount, fyTotal, monthly, alerts, budget] = await Promise.all([
    computeCompliance(db, org, fy, now),
    db.gstRegistration.count({ where: { archivedAt: null } }),
    db.brand.count({ where: { archivedAt: null } }),
    db.membership.count(),
    db.materialEntry.count({ where: { deletedAt: null } }),
    db.materialEntry.aggregate({ where: { deletedAt: null, financialYear: fy }, _sum: { quantityKg: true } }),
    db.materialEntry.groupBy({
      by: ["periodMonth", "categoryId"],
      where: { deletedAt: null, periodMonth: { gte: since } },
      _sum: { quantityKg: true },
    }),
    db.alert.findMany({
      where: { resolvedAt: null },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      take: 4,
    }),
    db.budget.findFirst({ where: { financialYear: fy, categoryId: null } }),
  ]);
  after(() => syncCompliance(db, org, result, now));

  const firstName = user.name?.split(" ")[0];
  const fyElapsed = result.fyProgress;
  const monthsLeft = Math.max(0, 12 - Math.floor(fyElapsed * 12));
  const overall: ObligationStatus =
    result.score === null ? "NO_OBLIGATION" : result.lines.some((l) => l.status === "AT_RISK") ? "AT_RISK" : result.lines.some((l) => l.status === "BEHIND") ? "BEHIND" : result.score >= 1 ? "MET" : "ON_TRACK";

  // Monthly chart: last 12 months, one series per category present (fixed category order).
  const categories = await db.materialCategory.findMany({
    where: { id: { in: [...new Set(monthly.map((m) => m.categoryId))] } },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });
  const months = [...new Set(monthly.map((m) => m.periodMonth.toISOString()))].sort();
  const rows: MonthlyRow[] = months.map((iso) => {
    const row: MonthlyRow = { month: formatMonth(new Date(iso)) };
    for (const c of categories) {
      const hit = monthly.find((m) => m.periodMonth.toISOString() === iso && m.categoryId === c.id);
      row[c.id] = Math.round(Number(hit?._sum.quantityKg ?? 0) / 100) / 10;
    }
    return row;
  });

  const checklist = [
    { done: gstCount > 0, label: "Add your GST registrations", href: "gst" },
    { done: brandCount > 0, label: "Add your brands", href: "brands" },
    { done: memberCount > 1, label: "Invite your team", href: "settings/members" },
    { done: materialCount > 0, label: "Enter material placed on market", href: "materials" },
  ];
  const setupComplete = checklist.every((c) => c.done);
  const spent = result.totals.certificateSpendInr;
  const budgetInr = budget ? Number(budget.amountInr) : null;

  return (
    <div className="grid gap-6">
      <section className="bg-brand-glow relative overflow-hidden rounded-2xl border bg-card p-6 sm:p-8">
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{org.name}</p>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Welcome{firstName ? `, ${firstName}` : ""}</h1>
            <p className="text-sm text-muted-foreground">Here is where your EPR compliance stands for FY {fy}.</p>
          </div>
          <div className="w-full max-w-xs space-y-2">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium">FY {fy}</span>
              <span className="text-muted-foreground">
                {monthsLeft} month{monthsLeft === 1 ? "" : "s"} left
              </span>
            </div>
            <ProgressBar value={fyElapsed} label={`${Math.round(fyElapsed * 100)}% of the financial year elapsed`} />
            <p className="text-xs text-muted-foreground">{formatPercent(fyElapsed)} of the year elapsed</p>
          </div>
        </div>
      </section>

      {!setupComplete && <SetupChecklist base={base} items={checklist} />}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Link href={`${base}/targets`} className="rounded-xl transition-shadow hover:shadow-md">
          <Card className="h-full gap-2 bg-brand-soft/40">
            <CardHeader>
              <CardDescription>Compliance score</CardDescription>
              <CardAction>
                <StatusBadge status={overall} />
              </CardAction>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-semibold tabular-nums">{formatPercent(result.score)}</p>
              <p className="text-xs text-muted-foreground">of this year&apos;s obligation fulfilled</p>
            </CardContent>
          </Card>
        </Link>
        <Tile label="Obligation remaining" value={formatTonnes(result.totals.shortfallKg)} hint={`of ${formatTonnes(result.totals.targetKg)} target`} href={`${base}/targets`} />
        <Tile label="EC risk if unmet" value={formatInr(result.totals.estimatedEcInr)} hint="Environmental Compensation estimate" href={`${base}/targets`} />
        {can("costs.view") ? (
          <Link href={`${base}/settings/budgets`} className="rounded-xl transition-shadow hover:shadow-md">
            <Card className="h-full gap-2">
              <CardHeader>
                <CardDescription>Certificate spend vs budget</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2">
                <p className="text-2xl font-semibold tabular-nums">
                  {formatInrCompact(spent)}
                  <span className="text-sm font-normal text-muted-foreground"> / {budgetInr === null ? "no budget" : formatInrCompact(budgetInr)}</span>
                </p>
                {budgetInr !== null && <ProgressBar value={budgetInr > 0 ? spent / budgetInr : 0} label="Budget used" warn={spent > budgetInr} />}
              </CardContent>
            </Card>
          </Link>
        ) : (
          <Tile label={`Placed on market · FY ${fy}`} value={formatTonnes(fyTotal._sum.quantityKg?.toString() ?? 0)} hint="So far this year" href={`${base}/materials`} />
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Progress by category</CardTitle>
            <CardDescription>Approved certificates against each FY {fy} target.</CardDescription>
            <CardAction>
              <Button asChild variant="ghost" size="sm">
                <Link href={`${base}/targets`}>
                  Details <ArrowRightIcon />
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {result.lines.length ? (
              <ObligationBars
                lines={result.lines.map((l) => ({
                  code: l.category.code,
                  label: short(l.category.name),
                  targetKg: l.targetKg,
                  fulfilledKg: l.fulfilledKg,
                  recyclingTargetKg: l.recyclingTargetKg,
                  progress: l.progress,
                  expectedProgress: l.expectedProgress,
                  status: l.status,
                }))}
              />
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">Add material data to see your obligations.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BellIcon className="size-4 text-primary" /> Alerts
            </CardTitle>
            <CardDescription>What needs attention now.</CardDescription>
            <CardAction>
              <Button asChild variant="ghost" size="sm">
                <Link href={`${base}/alerts`}>
                  All alerts <ArrowRightIcon />
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {alerts.length === 0 ? (
              <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <CheckCircle2Icon className="size-4 text-status-good" /> Nothing needs your attention.
              </p>
            ) : (
              <ul className="grid gap-3">
                {alerts.map((a) => {
                  const s = SEVERITY[a.severity];
                  return (
                    <li key={a.id}>
                      <Link href={`${base}/${a.link ?? "alerts"}`} className="flex gap-3 rounded-lg p-2 hover:bg-muted">
                        <s.icon className={cn("mt-0.5 size-4 shrink-0", s.tone)} aria-label={s.label} />
                        <span className="grid gap-0.5">
                          <span className="text-sm font-medium">{a.title}</span>
                          {a.body && <span className="text-xs text-muted-foreground">{a.body}</span>}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Placed on market — last 12 months</CardTitle>
          <CardDescription>
            Tonnes per month by category · {formatTonnes(fyTotal._sum.quantityKg?.toString() ?? 0)} so far in FY {fy}
          </CardDescription>
          <CardAction>
            <Button asChild variant="ghost" size="sm">
              <Link href={`${base}/materials`}>
                Materials <ArrowRightIcon />
              </Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {rows.length ? (
            <MonthlyChart rows={rows} series={categories.map((c) => ({ key: c.id, label: short(c.name) }))} />
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">No material data in the last 12 months.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SetupChecklist({ base, items }: { base: string; items: { done: boolean; label: string; href: string }[] }) {
  const done = items.filter((i) => i.done).length;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Getting started <Badge variant="secondary">{done}/{items.length}</Badge>
        </CardTitle>
        <CardDescription>Complete these steps to unlock obligations and your compliance score.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ProgressBar value={done / items.length} label="Setup progress" />
        <ul className="grid gap-1 sm:grid-cols-2">
          {items.map((item) => (
            <li key={item.label}>
              <Link href={`${base}/${item.href}`} className="group flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm transition-colors hover:bg-muted">
                {item.done ? <CheckCircle2Icon className="size-4 text-status-good" /> : <CircleIcon className="size-4 text-muted-foreground" />}
                <span className={cn("flex-1", item.done && "text-muted-foreground line-through")}>{item.label}</span>
                <ArrowRightIcon className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function ProgressBar({ value, label, warn }: { value: number; label: string; warn?: boolean }) {
  const pct = Math.min(100, Math.max(0, Math.round(value * 100)));
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="h-2 overflow-hidden rounded-full bg-muted">
      <div className={cn("h-full rounded-full transition-all", warn ? "bg-status-critical" : "bg-primary")} style={{ width: `${pct}%` }} />
    </div>
  );
}

function Tile({ label, value, hint, href }: { label: string; value: string; hint: string; href: string }) {
  return (
    <Link href={href} className="rounded-xl transition-shadow hover:shadow-md">
      <Card className="h-full gap-2">
        <CardHeader>
          <CardDescription>{label}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold tabular-nums">{value}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
