import { z } from "zod";
import { REMINDER_DAY_OPTIONS } from "@/lib/domain/deadlines/schedule";
import { optionalText, text } from "./common";

const DAY_MS = 86_400_000;

const reminderDays = z
  .array(z.coerce.number().int())
  .max(REMINDER_DAY_OPTIONS.length)
  .refine((days) => days.every((d) => REMINDER_DAY_OPTIONS.includes(d)), "Choose reminder times from the list")
  .transform((days) => [...new Set(days)].sort((a, b) => b - a));

/** Due date as "YYYY-MM-DD", from one year ago up to five years ahead (relative to `now`). */
function dueDate(now: Date) {
  return z
    .string({ message: "Choose a due date" })
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a due date")
    .transform((v, ctx) => {
      const [y, m, d] = v.split("-").map(Number);
      const date = new Date(Date.UTC(y, m - 1, d));
      if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
        ctx.addIssue({ code: "custom", message: "This date does not exist" });
        return z.NEVER;
      }
      if (date.getTime() < now.getTime() - 366 * DAY_MS) {
        ctx.addIssue({ code: "custom", message: "The due date can be at most one year in the past" });
        return z.NEVER;
      }
      if (date.getTime() > now.getTime() + 5 * 366 * DAY_MS) {
        ctx.addIssue({ code: "custom", message: "The due date can be at most five years ahead" });
        return z.NEVER;
      }
      return date;
    });
}

export function deadlineSchema(now = new Date()) {
  return z.object({
    title: text("Title", { min: 3, max: 120 }),
    description: optionalText("Notes", 500, { multiline: true }),
    dueDate: dueDate(now),
    reminderDays,
  });
}

/** Reminder settings only — statutory deadlines keep their regulated title and date. */
export const reminderSettingsSchema = z.object({ reminderDays });

/** FormData → plain input; `reminderDays` is a multi-value checkbox field. */
export function deadlineInput(formData: FormData) {
  return {
    title: formData.get("title") ?? undefined,
    description: formData.get("description") ?? undefined,
    dueDate: formData.get("dueDate") ?? undefined,
    reminderDays: formData.getAll("reminderDays"),
  };
}
