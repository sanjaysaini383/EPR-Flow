/**
 * Deadline status, reminder timing and calendar layout. Due dates are calendar
 * dates stored as UTC midnight; "today" is the current date in India (IST, UTC+5:30).
 */

const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 330 * 60_000;

/** Default reminder offsets (days before the due date). */
export const DEFAULT_REMINDER_DAYS = [30, 7, 1];
export const REMINDER_DAY_OPTIONS = [60, 30, 14, 7, 3, 1, 0];
export const DUE_SOON_DAYS = 14;

/** Reminders go out at 06:00 IST, just before the daily job runs at 07:00 IST. */
const SEND_HOUR_UTC = 0;
const SEND_MINUTE_UTC = 30;

/** Today's date in India, as UTC midnight. */
export function istToday(now: Date): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
}

/** Whole days from today (IST) to the due date; negative when overdue. */
export function daysUntil(dueDate: Date, now: Date): number {
  return Math.round((dueDate.getTime() - istToday(now).getTime()) / DAY_MS);
}

export type DeadlineState = "DONE" | "OVERDUE" | "DUE_SOON" | "UPCOMING";

export function deadlineState(deadline: { dueDate: Date; status: string }, now: Date): { state: DeadlineState; daysLeft: number } {
  const daysLeft = daysUntil(deadline.dueDate, now);
  if (deadline.status === "DONE") return { state: "DONE", daysLeft };
  if (daysLeft < 0) return { state: "OVERDUE", daysLeft };
  if (daysLeft <= DUE_SOON_DAYS) return { state: "DUE_SOON", daysLeft };
  return { state: "UPCOMING", daysLeft };
}

export function describeDaysLeft(daysLeft: number): string {
  if (daysLeft === 0) return "due today";
  if (daysLeft === 1) return "due tomorrow";
  if (daysLeft > 1) return `${daysLeft} days left`;
  return daysLeft === -1 ? "1 day overdue" : `${-daysLeft} days overdue`;
}

export function reminderSendAt(dueDate: Date, offsetDays: number): Date {
  return new Date(
    Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate() - offsetDays, SEND_HOUR_UTC, SEND_MINUTE_UTC),
  );
}

export type PlannedReminder = { deadlineId: string; channel: "EMAIL"; recipient: string; offsetDays: number; sendAt: Date };

/**
 * Email reminders still to come for one deadline: one per recipient and offset,
 * skipping times already in the past. Recipients are de-duplicated case-insensitively.
 */
export function planReminders(
  deadline: { id: string; dueDate: Date; reminderDays: number[] },
  recipients: string[],
  now: Date,
): PlannedReminder[] {
  const emails = [...new Set(recipients.map((r) => r.trim().toLowerCase()).filter(Boolean))];
  const offsets = [...new Set(deadline.reminderDays)].filter((d) => Number.isInteger(d) && d >= 0);
  const out: PlannedReminder[] = [];
  for (const offsetDays of offsets) {
    const sendAt = reminderSendAt(deadline.dueDate, offsetDays);
    if (sendAt.getTime() <= now.getTime()) continue;
    for (const recipient of emails) out.push({ deadlineId: deadline.id, channel: "EMAIL", recipient, offsetDays, sendAt });
  }
  return out;
}

// ── Calendar ─────────────────────────────────────────────────────────────

const MONTH_PARAM = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Parses "2026-10" into the first day of that month; falls back to the current IST month. */
export function parseCalendarMonth(raw: unknown, now: Date): Date {
  const match = typeof raw === "string" ? MONTH_PARAM.exec(raw) : null;
  if (match) {
    const year = Number(match[1]);
    if (year >= 2016 && year <= 2100) return new Date(Date.UTC(year, Number(match[2]) - 1, 1));
  }
  const today = istToday(now);
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
}

export function shiftMonth(month: Date, by: number): Date {
  return new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + by, 1));
}

export function monthParam(month: Date): string {
  return `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Weeks (Monday first) covering the month, padded with days from the neighbouring months. */
export function monthGrid(month: Date): { date: Date; inMonth: boolean }[][] {
  const first = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1));
  const mondayIndex = (first.getUTCDay() + 6) % 7;
  const start = new Date(first.getTime() - mondayIndex * DAY_MS);
  const daysInMonth = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
  const weeks = Math.ceil((mondayIndex + daysInMonth) / 7);
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = new Date(start.getTime() + (w * 7 + d) * DAY_MS);
      return { date, inMonth: date.getUTCMonth() === first.getUTCMonth() };
    }),
  );
}

export function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export type DeadlineAlert = { dedupeKey: string; severity: "WARNING" | "CRITICAL"; title: string; body: string; link: string };

const ALERT_WINDOW_DAYS = 7;
const shortDate = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Alerts for open deadlines that are overdue or due within a week. */
export function deadlineAlerts(deadlines: { id: string; title: string; dueDate: Date; status: string }[], now: Date): DeadlineAlert[] {
  return deadlines.flatMap((d): DeadlineAlert[] => {
    const { state, daysLeft } = deadlineState(d, now);
    if (state === "OVERDUE") {
      return [{ dedupeKey: `deadline:${d.id}`, severity: "CRITICAL", title: `${d.title} is ${describeDaysLeft(daysLeft)}`, body: `It was due on ${shortDate.format(d.dueDate)}. Mark it done in the calendar once filed.`, link: "calendar" }];
    }
    if (state === "DUE_SOON" && daysLeft <= ALERT_WINDOW_DAYS) {
      return [{ dedupeKey: `deadline:${d.id}`, severity: "WARNING", title: `${d.title} — ${describeDaysLeft(daysLeft)}`, body: `Due on ${shortDate.format(d.dueDate)}.`, link: "calendar" }];
    }
    return [];
  });
}
