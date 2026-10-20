import {
  ArrowRightIcon,
  CheckCircle2Icon,
  CircleIcon,
  GaugeIcon,
  PackageIcon,
  ReceiptIndianRupeeIcon,
  TagIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getOrgContext } from "@/lib/auth/session";
import { financialYearOf, financialYearProgress } from "@/lib/domain/financial-year";
import { formatTonnes } from "@/lib/domain/units";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ params }: PageProps<"/o/[orgSlug]/dashboard">) {
  const { orgSlug } = await params;
  const { org, db, user } = await getOrgContext(orgSlug);

  const now = new Date();
  const fy = financialYearOf(now);
  const [gstCount, brandCount, memberCount, materialCount, fyTotal] = await Promise.all([
    db.gstRegistration.count({ where: { archivedAt: null } }),
    db.brand.count({ where: { archivedAt: null } }),
    db.membership.count(),
    db.materialEntry.count({ where: { deletedAt: null } }),
    db.materialEntry.aggregate({ where: { deletedAt: null, financialYear: fy }, _sum: { quantityKg: true }, _count: true }),
  ]);

  const fyElapsed = Math.round(financialYearProgress(fy, now) * 100);
  const monthsLeft = Math.max(0, Math.ceil(((100 - fyElapsed) / 100) * 12));

  const checklist = [
    { done: gstCount > 0, label: "Add your GST registrations", href: "gst" },
    { done: brandCount > 0, label: "Add your brands", href: "brands" },
    { done: memberCount > 1, label: "Invite your team", href: "settings/members" },
    { done: materialCount > 0, label: "Enter material placed on market", href: "materials" },
  ];
  const doneCount = checklist.filter((c) => c.done).length;
  const firstName = user.name?.split(" ")[0];

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
            <ProgressBar value={fyElapsed} label={`${fyElapsed}% of the financial year elapsed`} />
            <p className="text-xs text-muted-foreground">{fyElapsed}% of the year elapsed</p>
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={PackageIcon}
          label={`Placed on market · FY ${fy}`}
          value={formatTonnes(fyTotal._sum.quantityKg?.toString() ?? 0)}
          hint={`${fyTotal._count} entr${fyTotal._count === 1 ? "y" : "ies"} so far`}
          href={`/o/${org.slug}/materials?fy=${fy}`}
        />
        <StatCard icon={ReceiptIndianRupeeIcon} label="GST registrations" value={gstCount} hint="Across all states" href={`/o/${org.slug}/gst`} />
        <StatCard icon={TagIcon} label="Brands" value={brandCount} hint="Active brands" href={`/o/${org.slug}/brands`} />
        <StatCard icon={UsersIcon} label="Team members" value={memberCount} hint="With access to this org" href={`/o/${org.slug}/settings/members`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Getting started
              <Badge variant={doneCount === checklist.length ? "default" : "secondary"}>
                {doneCount}/{checklist.length}
              </Badge>
            </CardTitle>
            <CardDescription>Complete these steps to unlock obligations and your compliance score.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <ProgressBar value={(doneCount / checklist.length) * 100} label="Setup progress" />
            <ul className="grid gap-1">
              {checklist.map((item) => (
                <li key={item.label}>
                  <Link
                    href={`/o/${org.slug}/${item.href}`}
                    className="group flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm transition-colors hover:bg-muted"
                  >
                    {item.done ? (
                      <CheckCircle2Icon className="size-4 text-success" />
                    ) : (
                      <CircleIcon className="size-4 text-muted-foreground" />
                    )}
                    <span className={cn("flex-1", item.done && "text-muted-foreground line-through")}>{item.label}</span>
                    <ArrowRightIcon className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GaugeIcon className="size-4 text-primary" /> Compliance score
            </CardTitle>
            <CardDescription>Category progress, shortfall and Environmental Compensation risk.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {["Category I — Rigid", "Category II — Flexible", "Category III — Multi-layered"].map((label, i) => (
              <div key={label} className="grid gap-1.5 opacity-50">
                <div className="flex justify-between text-xs">
                  <span>{label}</span>
                  <span className="text-muted-foreground">—</span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div className="h-2 rounded-full bg-primary/40" style={{ width: `${[60, 35, 80][i]}%` }} />
                </div>
              </div>
            ))}
            <p className="rounded-lg bg-muted px-3 py-2 text-center text-xs text-muted-foreground">
              Available in phase 3 once material data is entered.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ProgressBar({ value, label }: { value: number; label: string }) {
  const pct = Math.min(100, Math.max(0, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-2 overflow-hidden rounded-full bg-muted"
    >
      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  hint: string;
  href: string;
}) {
  return (
    <Link href={href} className="rounded-xl transition-shadow hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
      <StatCardBody icon={Icon} label={label} value={value} hint={hint} />
    </Link>
  );
}

function StatCardBody({ icon: Icon, label, value, hint }: { icon: LucideIcon; label: string; value: string | number; hint: string }) {
  return (
    <Card className="h-full gap-3">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardDescription>{label}</CardDescription>
        <span className="flex size-8 items-center justify-center rounded-lg bg-brand-soft text-primary">
          <Icon className="size-4" />
        </span>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
