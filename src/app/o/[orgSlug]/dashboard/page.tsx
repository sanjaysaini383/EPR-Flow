import { CheckCircle2Icon, CircleIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getOrgContext } from "@/lib/auth/session";
import { financialYearOf, financialYearProgress } from "@/lib/domain/financial-year";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ params }: PageProps<"/o/[orgSlug]/dashboard">) {
  const { orgSlug } = await params;
  const { org, db, user } = await getOrgContext(orgSlug);

  const [gstCount, brandCount, memberCount, materialCount] = await Promise.all([
    db.gstRegistration.count({ where: { archivedAt: null } }),
    db.brand.count({ where: { archivedAt: null } }),
    db.membership.count(),
    db.materialEntry.count({ where: { deletedAt: null } }),
  ]);

  const now = new Date();
  const fy = financialYearOf(now);
  const fyElapsed = Math.round(financialYearProgress(fy, now) * 100);

  const checklist = [
    { done: gstCount > 0, label: "Add your GST registrations", href: "gst" },
    { done: brandCount > 0, label: "Add your brands", href: "brands" },
    { done: memberCount > 1, label: "Invite your team", href: "settings/members" },
    { done: materialCount > 0, label: "Enter material placed on market", href: "materials" },
  ];
  const doneCount = checklist.filter((c) => c.done).length;

  return (
    <div className="grid gap-6">
      <PageHeader
        title={`Welcome${user.name ? `, ${user.name.split(" ")[0]}` : ""}`}
        description={`${org.name} · FY ${fy}`}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Financial year" value={fy} hint={`${fyElapsed}% of the year elapsed`} />
        <StatCard label="GST registrations" value={String(gstCount)} hint="Across all states" />
        <StatCard label="Brands" value={String(brandCount)} hint={`${memberCount} team member${memberCount === 1 ? "" : "s"}`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Getting started <Badge variant="secondary">{doneCount}/{checklist.length}</Badge>
          </CardTitle>
          <CardDescription>Complete these steps to see your EPR obligations and compliance score.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-1">
            {checklist.map((item) => (
              <li key={item.label}>
                <Link
                  href={`/o/${org.slug}/${item.href}`}
                  className="flex items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted"
                >
                  {item.done ? (
                    <CheckCircle2Icon className="size-4 text-primary" />
                  ) : (
                    <CircleIcon className="size-4 text-muted-foreground" />
                  )}
                  <span className={cn(item.done && "text-muted-foreground line-through")}>{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Compliance score, category progress and cost tracking arrive in phase 3.
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">{hint}</CardContent>
    </Card>
  );
}
