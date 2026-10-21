import { describe, expect, it } from "vitest";
import { formatDueDate, reminderEmail, whatsappMessage } from "../deadlines/messages";
import {
  daysUntil,
  deadlineAlerts,
  deadlineState,
  describeDaysLeft,
  istToday,
  monthGrid,
  parseCalendarMonth,
  planReminders,
  reminderSendAt,
} from "../deadlines/schedule";
import { buildStatutoryDeadlines, dueDateFor, parseDeadlineSpecs } from "../deadlines/statutory";
import type { Rule } from "../rules/resolve";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

function rule(partial: Partial<Rule>): Rule {
  return {
    id: "r1",
    stream: "PLASTIC",
    categoryId: null,
    entityType: null,
    ruleType: "FILING_DEADLINE",
    financialYear: null,
    value: 0,
    unit: "DATE",
    parameters: null,
    effectiveFrom: d("2022-04-01"),
    effectiveTo: null,
    version: 1,
    isVerified: false,
    ...partial,
  };
}

const annualReturn = { key: "annual-return", title: "Annual return", month: 6, day: 30, yearOffset: 1 };

describe("statutory deadlines", () => {
  it("reads deadline specs and the legacy shorthand, skipping invalid entries", () => {
    expect(parseDeadlineSpecs({ deadlines: [annualReturn, { key: "x", title: "Bad" }] })).toEqual([annualReturn]);
    expect(parseDeadlineSpecs({ annualReturnDue: "06-30" })).toEqual([annualReturn]);
    expect(parseDeadlineSpecs({ annualReturnDue: "June" })).toEqual([]);
    expect(parseDeadlineSpecs(null)).toEqual([]);
  });

  it("places dates relative to the financial year and clamps impossible days", () => {
    expect(dueDateFor(annualReturn, "2025-26")).toEqual(d("2026-06-30"));
    expect(dueDateFor({ month: 3, day: 31, yearOffset: 1 }, "2025-26")).toEqual(d("2026-03-31"));
    expect(dueDateFor({ month: 2, day: 31, yearOffset: 1 }, "2027-28")).toEqual(d("2028-02-29")); // leap year
    expect(dueDateFor({ month: 2, day: 31, yearOffset: 1 }, "2025-26")).toEqual(d("2026-02-28"));
  });

  it("generates one deadline per stream, FY and spec from the rule in force", () => {
    const rules = [
      rule({ id: "plastic-v1", parameters: { deadlines: [annualReturn] } }),
      rule({ id: "plastic-v2", version: 2, parameters: { deadlines: [{ ...annualReturn, day: 15 }] } }),
      rule({ id: "ewaste", stream: "EWASTE", parameters: { annualReturnDue: "06-30" } }),
    ];
    const out = buildStatutoryDeadlines({ rules, streams: ["PLASTIC", "EWASTE", "BATTERY"], financialYears: ["2025-26"] });
    expect(out).toHaveLength(2); // no battery rule
    const plastic = out.find((x) => x.stream === "PLASTIC")!;
    expect(plastic).toMatchObject({
      dedupeKey: "statutory:PLASTIC:annual-return:2025-26",
      title: "Annual return — Plastic packaging, FY 2025-26",
      ruleId: "plastic-v2", // the higher version wins
      isVerified: false,
    });
    expect(plastic.dueDate).toEqual(d("2026-06-15"));
  });

  it("ignores rules not yet in force for that FY", () => {
    const rules = [rule({ effectiveFrom: d("2026-04-01"), parameters: { deadlines: [annualReturn] } })];
    expect(buildStatutoryDeadlines({ rules, streams: ["PLASTIC"], financialYears: ["2025-26"] })).toEqual([]);
  });
});

describe("deadline status and timing", () => {
  // 20 Oct 2026, 23:00 IST is still 20 Oct in UTC terms — but 19:30 UTC on the 20th is already the 21st in India.
  const lateEvening = new Date("2026-10-20T19:30:00Z");

  it("uses the Indian calendar date for 'today'", () => {
    expect(istToday(lateEvening)).toEqual(d("2026-10-21"));
    expect(daysUntil(d("2026-10-22"), lateEvening)).toBe(1);
  });

  it("classifies deadlines", () => {
    const now = new Date("2026-10-20T06:00:00Z");
    expect(deadlineState({ dueDate: d("2026-10-19"), status: "UPCOMING" }, now)).toEqual({ state: "OVERDUE", daysLeft: -1 });
    expect(deadlineState({ dueDate: d("2026-10-20"), status: "UPCOMING" }, now).state).toBe("DUE_SOON");
    expect(deadlineState({ dueDate: d("2026-11-03"), status: "UPCOMING" }, now).state).toBe("DUE_SOON");
    expect(deadlineState({ dueDate: d("2026-11-04"), status: "UPCOMING" }, now).state).toBe("UPCOMING");
    expect(deadlineState({ dueDate: d("2026-10-01"), status: "DONE" }, now).state).toBe("DONE");
  });

  it("describes days left in plain words", () => {
    expect(describeDaysLeft(0)).toBe("due today");
    expect(describeDaysLeft(1)).toBe("due tomorrow");
    expect(describeDaysLeft(9)).toBe("9 days left");
    expect(describeDaysLeft(-1)).toBe("1 day overdue");
    expect(describeDaysLeft(-4)).toBe("4 days overdue");
  });

  it("schedules reminders at 06:00 IST on the chosen days, only in the future", () => {
    expect(reminderSendAt(d("2026-11-30"), 7)).toEqual(new Date("2026-11-23T00:30:00Z"));
    const now = new Date("2026-11-10T00:00:00Z");
    const planned = planReminders({ id: "dl", dueDate: d("2026-11-30"), reminderDays: [30, 7, 1, 7] }, ["A@x.in", "a@x.in ", "b@x.in"], now);
    // 30 days before (31 Oct) is already past; 7 and 1 remain, for two distinct recipients.
    expect(planned).toHaveLength(4);
    expect(new Set(planned.map((p) => p.recipient))).toEqual(new Set(["a@x.in", "b@x.in"]));
    expect(new Set(planned.map((p) => p.offsetDays))).toEqual(new Set([7, 1]));
  });

  it("raises alerts only for overdue deadlines and those due within a week", () => {
    const now = new Date("2026-10-20T06:00:00Z");
    const alerts = deadlineAlerts(
      [
        { id: "a", title: "Annual return", dueDate: d("2026-10-18"), status: "UPCOMING" },
        { id: "b", title: "Board review", dueDate: d("2026-10-25"), status: "UPCOMING" },
        { id: "c", title: "Later", dueDate: d("2026-11-02"), status: "UPCOMING" },
        { id: "e", title: "Filed", dueDate: d("2026-10-18"), status: "DONE" },
      ],
      now,
    );
    expect(alerts.map((a) => [a.dedupeKey, a.severity])).toEqual([
      ["deadline:a", "CRITICAL"],
      ["deadline:b", "WARNING"],
    ]);
    expect(alerts[0].title).toBe("Annual return is 2 days overdue");
  });
});

describe("calendar grid", () => {
  it("lays out a month in Monday-first weeks", () => {
    const weeks = monthGrid(d("2026-02-01")); // 1 Feb 2026 is a Sunday
    expect(weeks).toHaveLength(5);
    expect(weeks[0][0].date).toEqual(d("2026-01-26"));
    expect(weeks[0][6]).toEqual({ date: d("2026-02-01"), inMonth: true });
    expect(weeks.flat().filter((c) => c.inMonth)).toHaveLength(28);
  });

  it("parses the month parameter and falls back to the current month", () => {
    const now = new Date("2026-10-20T06:00:00Z");
    expect(parseCalendarMonth("2027-03", now)).toEqual(d("2027-03-01"));
    expect(parseCalendarMonth("2027-13", now)).toEqual(d("2026-10-01"));
    expect(parseCalendarMonth("1999-01", now)).toEqual(d("2026-10-01"));
    expect(parseCalendarMonth(undefined, now)).toEqual(d("2026-10-01"));
  });
});

describe("reminder messages", () => {
  const input = {
    organizationName: 'Acme <script>alert("x")</script>',
    title: "Annual return — Plastic packaging, FY 2025-26",
    description: null,
    dueDate: d("2026-06-30"),
    daysLeft: 7,
    url: "https://app.eprflow.in/o/acme/calendar",
  };

  it("escapes user-supplied text in the HTML email", () => {
    const email = reminderEmail(input);
    expect(email.subject).toBe("Reminder: Annual return — Plastic packaging, FY 2025-26 — 7 days left (30 Jun 2026)");
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.text).toContain("due on 30 Jun 2026 (7 days left)");
  });

  it("builds a WhatsApp share link with the encoded message", () => {
    const { text, link } = whatsappMessage(input);
    expect(text.split("\n")[0]).toBe("*Annual return — Plastic packaging, FY 2025-26*");
    expect(link.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(link.slice("https://wa.me/?text=".length))).toBe(text);
    expect(formatDueDate(d("2026-06-30"))).toBe("30 Jun 2026");
  });
});
