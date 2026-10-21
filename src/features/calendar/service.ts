import "server-only";
import type { TenantDb } from "@/lib/db/tenant";
import { buildStatutoryDeadlines } from "@/lib/domain/deadlines/statutory";
import { deadlineAlerts, istToday, planReminders } from "@/lib/domain/deadlines/schedule";
import { financialYearStartYear, formatFinancialYear } from "@/lib/domain/financial-year";
import type { Rule } from "@/lib/domain/rules/resolve";

type Org = { id: string; wasteStreams: string[] };

/** Roles that receive email reminders. */
export const REMINDER_ROLES = ["ADMIN", "COMPLIANCE_MANAGER"] as const;

export async function reminderRecipients(db: TenantDb): Promise<string[]> {
  const members = await db.membership.findMany({
    where: { role: { in: [...REMINDER_ROLES] } },
    select: { user: { select: { email: true } } },
  });
  return members.map((m) => m.user.email);
}

/**
 * Brings the organisation's calendar up to date:
 *   - creates statutory deadlines for the previous and current FY from FILING_DEADLINE rules
 *     (the previous FY matters: its annual return falls due during the current one),
 *   - moves open statutory deadlines when a rule version changes their date,
 *   - schedules email reminders for every open deadline and current Admin/Compliance Manager.
 * Idempotent (unique keys + skipDuplicates), so it runs on page views and from the daily cron.
 */
export async function syncDeadlines(db: TenantDb, org: Org, now = new Date()) {
  const current = financialYearStartYear(istToday(now));
  const financialYears = [formatFinancialYear(current - 1), formatFinancialYear(current)];

  const rules = await db.regulationRule.findMany({
    where: { ruleType: "FILING_DEADLINE", stream: { in: org.wasteStreams as never } },
  });
  const statutory = buildStatutoryDeadlines({
    streams: org.wasteStreams,
    financialYears,
    rules: rules.map(
      (r): Rule => ({
        id: r.id,
        stream: r.stream,
        categoryId: r.categoryId,
        entityType: r.entityType,
        ruleType: r.ruleType,
        financialYear: r.financialYear,
        value: Number(r.value),
        unit: r.unit,
        parameters: (r.parameters as Record<string, unknown> | null) ?? null,
        effectiveFrom: r.effectiveFrom,
        effectiveTo: r.effectiveTo,
        version: r.version,
        isVerified: r.isVerified,
      }),
    ),
  });

  if (statutory.length) {
    const existing = await db.deadline.findMany({
      where: { dedupeKey: { in: statutory.map((d) => d.dedupeKey) } },
      select: { id: true, dedupeKey: true, dueDate: true, title: true, ruleId: true, status: true },
    });
    const byKey = new Map(existing.map((d) => [d.dedupeKey, d]));
    const creates = statutory.filter((d) => !byKey.has(d.dedupeKey));
    const updates = statutory.filter((d) => {
      const e = byKey.get(d.dedupeKey);
      return e && e.status === "UPCOMING" && (e.dueDate.getTime() !== d.dueDate.getTime() || e.title !== d.title || e.ruleId !== d.ruleId);
    });
    await Promise.all([
      creates.length
        ? db.deadline.createMany({
            data: creates.map((d) => ({
              organizationId: org.id,
              dedupeKey: d.dedupeKey,
              title: d.title,
              description: d.description,
              dueDate: d.dueDate,
              financialYear: d.financialYear,
              stream: d.stream as never,
              ruleId: d.ruleId,
            })),
            skipDuplicates: true,
          })
        : null,
      ...updates.map((d) =>
        db.deadline.updateMany({
          where: { dedupeKey: d.dedupeKey, status: "UPCOMING" },
          data: { dueDate: d.dueDate, title: d.title, description: d.description, ruleId: d.ruleId },
        }),
      ),
    ]);
    // A moved due date invalidates reminders scheduled for the old date.
    if (updates.length) {
      const moved = existing.filter((e) => updates.some((u) => u.dedupeKey === e.dedupeKey)).map((e) => e.id);
      await db.reminder.deleteMany({ where: { deadlineId: { in: moved }, status: "SCHEDULED" } });
    }
  }

  await Promise.all([scheduleReminders(db, org, now), syncDeadlineAlerts(db, org, now)]);
}

/** Opens alerts for deadlines due within a week or overdue; resolves them once done or deleted. */
export async function syncDeadlineAlerts(db: TenantDb, org: Org, now = new Date()) {
  const [deadlines, existing] = await Promise.all([
    db.deadline.findMany({
      where: { status: "UPCOMING", dueDate: { lte: new Date(istToday(now).getTime() + 8 * 86_400_000) } },
      select: { id: true, title: true, dueDate: true, status: true },
    }),
    db.alert.findMany({ where: { dedupeKey: { startsWith: "deadline:" } } }),
  ]);
  const specs = deadlineAlerts(deadlines, now);
  const byKey = new Map(existing.map((a) => [a.dedupeKey, a]));
  const wanted = new Set(specs.map((s) => s.dedupeKey));
  const creates = specs.filter((s) => !byKey.has(s.dedupeKey));
  const updates = specs.filter((s) => {
    const a = byKey.get(s.dedupeKey);
    return a && (a.resolvedAt !== null || a.title !== s.title || a.severity !== s.severity);
  });
  const resolves = existing.filter((a) => a.resolvedAt === null && !wanted.has(a.dedupeKey)).map((a) => a.id);
  await Promise.all([
    creates.length
      ? db.alert.createMany({ data: creates.map((a) => ({ organizationId: org.id, ...a })), skipDuplicates: true })
      : null,
    ...updates.map((a) =>
      db.alert.updateMany({
        where: { dedupeKey: a.dedupeKey },
        data: { severity: a.severity, title: a.title, body: a.body, resolvedAt: null, ...(byKey.get(a.dedupeKey)?.severity !== a.severity ? { readAt: null } : {}) },
      }),
    ),
    resolves.length ? db.alert.updateMany({ where: { id: { in: resolves } }, data: { resolvedAt: now } }) : null,
  ]);
}

/** Creates missing reminder rows for every open, future deadline. */
export async function scheduleReminders(db: TenantDb, org: Org, now = new Date(), deadlineIds?: string[]) {
  const [deadlines, recipients] = await Promise.all([
    db.deadline.findMany({
      where: { status: "UPCOMING", dueDate: { gte: istToday(now) }, ...(deadlineIds ? { id: { in: deadlineIds } } : {}) },
      select: { id: true, dueDate: true, reminderDays: true },
    }),
    reminderRecipients(db),
  ]);
  const planned = deadlines.flatMap((d) => planReminders(d, recipients, now));
  if (planned.length) {
    await db.reminder.createMany({
      data: planned.map((p) => ({ organizationId: org.id, ...p })),
      skipDuplicates: true,
    });
  }
}
