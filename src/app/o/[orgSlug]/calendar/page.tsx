import {
  BellIcon,
  BellOffIcon,
  CalendarCheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  ClockIcon,
  OctagonAlertIcon,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DeadlineActions, DeadlineDialog, type DeadlineFormValues } from "@/features/calendar/components";
import { syncDeadlines } from "@/features/calendar/service";
import { getOrgContext } from "@/lib/auth/session";
import { whatsappMessage } from "@/lib/domain/deadlines/messages";
import {
  dateKey,
  deadlineState,
  describeDaysLeft,
  istToday,
  monthGrid,
  monthParam,
  parseCalendarMonth,
  shiftMonth,
  type DeadlineState,
} from "@/lib/domain/deadlines/schedule";
import { appUrl } from "@/lib/email/send";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Calendar" };

const STATE: Record<DeadlineState, { label: string; icon: LucideIcon; tone: string; chip: string }> = {
  OVERDUE: { label: "Overdue", icon: OctagonAlertIcon, tone: "text-status-critical", chip: "border-status-critical/40 bg-status-critical/10" },
  DUE_SOON: { label: "Due soon", icon: ClockIcon, tone: "text-status-warning", chip: "border-status-warning/50 bg-status-warning/10" },
  UPCOMING: { label: "Upcoming", icon: CalendarCheckIcon, tone: "text-primary", chip: "border-primary/30 bg-brand-soft/60" },
  DONE: { label: "Done", icon: CircleCheckIcon, tone: "text-status-good", chip: "border-border bg-muted text-muted-foreground line-through" },
};
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const monthTitle = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const dayMonth = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const reminderTime = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

export default async function CalendarPage({ params, searchParams }: PageProps<"/o/[orgSlug]/calendar">) {
  const { orgSlug } = await params;
  const { month: rawMonth } = await searchParams;
  const { db, org, can } = await getOrgContext(orgSlug);
  const now = new Date();
  const canManage = can("deadlines.manage");

  // First visit: generate the statutory calendar before rendering; afterwards refresh in the background.
  const hasStatutory = await db.deadline.count({ where: { ruleId: { not: null } } });
  if (hasStatutory === 0) await syncDeadlines(db, org, now);
  else after(() => syncDeadlines(db, org, now));

  const month = parseCalendarMonth(rawMonth, now);
  const weeks = monthGrid(month);
  const gridStart = weeks[0][0].date;
  const gridEnd = weeks.at(-1)![6].date;
  const today = istToday(now);

  const [inGrid, open, recentlyDone] = await Promise.all([
    db.deadline.findMany({ where: { dueDate: { gte: gridStart, lte: gridEnd } }, orderBy: { dueDate: "asc" } }),
    db.deadline.findMany({ where: { status: "UPCOMING" }, orderBy: { dueDate: "asc" }, take: 40 }),
    db.deadline.findMany({ where: { status: "DONE" }, orderBy: { completedAt: "desc" }, take: 8 }),
  ]);
  const listed = [...open, ...recentlyDone];
  const [reminders, rules] = await Promise.all([
    db.reminder.findMany({
      where: { deadlineId: { in: open.map((d) => d.id) }, status: { in: ["SCHEDULED", "FAILED"] } },
      select: { deadlineId: true, status: true, sendAt: true, recipient: true },
      orderBy: { sendAt: "asc" },
    }),
    db.regulationRule.findMany({
      where: { id: { in: [...new Set(listed.concat(inGrid).flatMap((d) => (d.ruleId ? [d.ruleId] : [])))] } },
      select: { id: true, isVerified: true },
    }),
  ]);
  const verified = new Map(rules.map((r) => [r.id, r.isVerified]));
  const placeholderCount = open.filter((d) => d.ruleId && !verified.get(d.ruleId)).length;

  const byDay = new Map<string, typeof inGrid>();
  for (const d of inGrid) {
    const key = dateKey(d.dueDate);
    byDay.set(key, [...(byDay.get(key) ?? []), d]);
  }

  const formValues = (d: (typeof listed)[number]): DeadlineFormValues => ({
    id: d.id,
    title: d.title,
    description: d.description ?? "",
    dueDate: dateKey(d.dueDate),
    reminderDays: d.reminderDays,
    statutory: d.ruleId !== null,
  });

  const base = `/o/${orgSlug}/calendar`;
  const overdue = open.filter((d) => d.dueDate < today);
  const upcoming = open.filter((d) => d.dueDate >= today);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Compliance calendar"
        description="Statutory filing dates from the regulation rules, plus your own deadlines. Admins and Compliance Managers get email reminders."
        actions={canManage && <DeadlineDialog orgSlug={orgSlug} defaultDate={dateKey(new Date(today.getTime() + 30 * 86_400_000))} />}
      />

      {placeholderCount > 0 && (
        <Alert className="border-status-warning/50">
          <CircleAlertIcon className="text-status-warning" />
          <AlertTitle>Placeholder filing dates</AlertTitle>
          <AlertDescription>
            {placeholderCount} statutory date(s) come from regulation rules that have not been verified against the latest CPCB notification. Confirm them on the CPCB EPR portal.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Card className="hidden md:flex">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-lg">{monthTitle.format(month)}</CardTitle>
            <div className="flex items-center gap-1">
              <Button asChild variant="ghost" size="icon-sm" aria-label="Previous month">
                <Link href={`${base}?month=${monthParam(shiftMonth(month, -1))}`} scroll={false}>
                  <ChevronLeftIcon />
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={base} scroll={false}>
                  Today
                </Link>
              </Button>
              <Button asChild variant="ghost" size="icon-sm" aria-label="Next month">
                <Link href={`${base}?month=${monthParam(shiftMonth(month, 1))}`} scroll={false}>
                  <ChevronRightIcon />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div role="grid" aria-label={`Deadlines in ${monthTitle.format(month)}`} className="grid grid-cols-7 overflow-hidden rounded-lg border">
              {WEEKDAYS.map((d) => (
                <div key={d} role="columnheader" className="border-b bg-muted/50 px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  {d}
                </div>
              ))}
              {weeks.flat().map(({ date, inMonth }) => {
                const key = dateKey(date);
                const items = byDay.get(key) ?? [];
                const isToday = date.getTime() === today.getTime();
                return (
                  <div
                    key={key}
                    role="gridcell"
                    aria-label={`${dayMonth.format(date)}${items.length ? `, ${items.length} deadline(s)` : ""}`}
                    className={cn("min-h-24 border-b border-r p-1.5 [&:nth-child(7n)]:border-r-0", !inMonth && "bg-muted/30")}
                  >
                    <span
                      className={cn(
                        "inline-flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                        !inMonth && "text-muted-foreground/60",
                        isToday && "bg-primary font-semibold text-primary-foreground",
                      )}
                    >
                      {date.getUTCDate()}
                    </span>
                    <ul className="mt-1 grid gap-1">
                      {items.map((d) => {
                        const { state } = deadlineState(d, now);
                        const s = STATE[state];
                        return (
                          <li key={d.id} title={`${d.title} — ${s.label}`} className={cn("flex items-center gap-1 rounded border px-1 py-0.5 text-[11px] leading-tight", s.chip)}>
                            <s.icon className={cn("size-3 shrink-0", s.tone)} aria-label={s.label} />
                            <span className="line-clamp-2">{d.title}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6">
          {open.length === 0 && recentlyDone.length === 0 ? (
            <EmptyState
              icon={<CalendarCheckIcon />}
              title="No deadlines yet"
              description="Statutory dates appear once filing-deadline rules exist for your waste streams. You can also add your own."
            />
          ) : (
            <>
              {overdue.length > 0 && deadlineList("Overdue", overdue)}
              {deadlineList("Upcoming", upcoming, "Nothing upcoming — you're all caught up.")}
              {recentlyDone.length > 0 && deadlineList("Recently completed", recentlyDone)}
            </>
          )}
        </div>
      </div>
    </div>
  );

  function deadlineList(title: string, items: typeof listed, empty?: string) {
    return (
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
          {title === "Upcoming" && <CardDescription>Reminders are emailed at 6 AM IST on the chosen days.</CardDescription>}
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">{empty}</p>
          ) : (
            <ul className="grid divide-y">
              {items.map((d) => {
                const { state, daysLeft } = deadlineState(d, now);
                const s = STATE[state];
                const mine = reminders.filter((r) => r.deadlineId === d.id);
                const next = mine.find((r) => r.status === "SCHEDULED");
                const failed = mine.filter((r) => r.status === "FAILED").length;
                const recipients = new Set(mine.map((r) => r.recipient)).size;
                const whatsapp = whatsappMessage({
                  organizationName: org.name,
                  title: d.title,
                  description: d.description,
                  dueDate: d.dueDate,
                  daysLeft,
                  url: appUrl(base),
                });
                return (
                  <li key={d.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                    <div className={cn("flex w-14 shrink-0 flex-col items-center rounded-lg border py-1", s.chip, "no-underline")} aria-hidden>
                      <span className="text-[11px] uppercase text-muted-foreground">{dayMonth.format(d.dueDate).split(" ")[1]}</span>
                      <span className="text-lg font-semibold leading-none tabular-nums">{d.dueDate.getUTCDate()}</span>
                      <span className="text-[10px] text-muted-foreground tabular-nums">{d.dueDate.getUTCFullYear()}</span>
                    </div>
                    <div className="grid min-w-0 flex-1 gap-1">
                      <span className={cn("font-medium", state === "DONE" && "text-muted-foreground line-through")}>{d.title}</span>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <Badge variant="outline" className="gap-1">
                          <s.icon className={cn("size-3", s.tone)} aria-hidden />
                          {state === "DONE" ? "Done" : `${s.label} · ${describeDaysLeft(daysLeft)}`}
                        </Badge>
                        <Badge variant="secondary">{d.ruleId ? "Statutory" : "Internal"}</Badge>
                        {d.ruleId && !verified.get(d.ruleId) && (
                          <Badge variant="outline" className="border-status-warning/50">
                            Placeholder date
                          </Badge>
                        )}
                      </div>
                      {d.description && <p className="text-sm text-muted-foreground">{d.description}</p>}
                      {state !== "DONE" && (
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          {next ? <BellIcon className="size-3" aria-hidden /> : <BellOffIcon className="size-3" aria-hidden />}
                          {next
                            ? `Next reminder ${reminderTime.format(next.sendAt)} to ${recipients} recipient${recipients === 1 ? "" : "s"}`
                            : d.reminderDays.length
                              ? "No more reminders before the due date"
                              : "Reminders off"}
                          {failed > 0 && <span className="text-status-critical"> · {failed} not delivered</span>}
                        </p>
                      )}
                      {state === "DONE" && d.completedAt && <p className="text-xs text-muted-foreground">Completed {reminderTime.format(d.completedAt)}</p>}
                      <DeadlineActions orgSlug={orgSlug} deadline={formValues(d)} done={state === "DONE"} whatsappLink={whatsapp.link} canManage={canManage} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    );
  }
}
