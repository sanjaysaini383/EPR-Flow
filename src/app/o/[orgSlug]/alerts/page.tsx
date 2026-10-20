import { BellOffIcon, InfoIcon, OctagonAlertIcon, TriangleAlertIcon, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MarkReadButton } from "@/features/compliance/components/alert-controls";
import { getOrgContext } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Alerts" };

const SEVERITY: Record<string, { icon: LucideIcon; tone: string; label: string }> = {
  CRITICAL: { icon: OctagonAlertIcon, tone: "text-status-critical", label: "Critical" },
  WARNING: { icon: TriangleAlertIcon, tone: "text-status-warning", label: "Warning" },
  INFO: { icon: InfoIcon, tone: "text-muted-foreground", label: "Info" },
};
const dateFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });

export default async function AlertsPage({ params }: PageProps<"/o/[orgSlug]/alerts">) {
  const { orgSlug } = await params;
  const { db } = await getOrgContext(orgSlug);

  const [active, resolved] = await Promise.all([
    db.alert.findMany({ where: { resolvedAt: null }, orderBy: [{ severity: "desc" }, { createdAt: "desc" }] }),
    db.alert.findMany({ where: { resolvedAt: { not: null } }, orderBy: { resolvedAt: "desc" }, take: 20 }),
  ]);
  const unread = active.filter((a) => !a.readAt).length;

  return (
    <div className="grid max-w-4xl gap-6">
      <PageHeader
        title="Alerts"
        description="Generated from your targets every day and whenever the dashboard is opened."
        actions={unread > 0 && <MarkReadButton orgSlug={orgSlug} alertId={null} />}
      />

      {active.length === 0 ? (
        <EmptyState icon={<BellOffIcon />} title="No active alerts" description="You're on track. Alerts appear here when a target falls behind or data is missing." />
      ) : (
        <ul className="grid gap-3">
          {active.map((a) => {
            const s = SEVERITY[a.severity];
            return (
              <li key={a.id}>
                <Card className={cn("gap-0 py-4", !a.readAt && "border-primary/40")}>
                  <CardContent className="flex items-start gap-4">
                    <s.icon className={cn("mt-0.5 size-5 shrink-0", s.tone)} aria-hidden />
                    <div className="grid flex-1 gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{s.label}</Badge>
                        {!a.readAt && <Badge>New</Badge>}
                        <span className="text-xs text-muted-foreground">{dateFormat.format(a.createdAt)}</span>
                      </div>
                      <Link href={`/o/${orgSlug}/${a.link ?? "targets"}`} className="font-medium underline-offset-4 hover:underline">
                        {a.title}
                      </Link>
                      {a.body && <p className="text-sm text-muted-foreground">{a.body}</p>}
                    </div>
                    {!a.readAt && <MarkReadButton orgSlug={orgSlug} alertId={a.id} />}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {resolved.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recently resolved</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm">
              {resolved.map((a) => (
                <li key={a.id} className="flex justify-between gap-4 text-muted-foreground">
                  <span className="line-through">{a.title}</span>
                  <span className="shrink-0 text-xs">{a.resolvedAt && dateFormat.format(a.resolvedAt)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
