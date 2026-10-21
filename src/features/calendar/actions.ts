"use server";

import { revalidatePath } from "next/cache";
import { fieldErrors, handleActionError, type ActionState } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/session";
import { deadlineInput, deadlineSchema, reminderSettingsSchema } from "@/lib/validation/deadline";
import { scheduleReminders, syncDeadlineAlerts } from "./service";

const ID = /^[a-z0-9]{10,40}$/i;

function done(orgSlug: string, message: string): ActionState {
  revalidatePath(`/o/${orgSlug}`, "layout");
  return { ok: true, message };
}

/** Create a custom deadline (`id` null) or update one. Statutory deadlines only accept reminder changes. */
export async function saveDeadlineAction(orgSlug: string, id: string | null, _prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    if (id !== null && !ID.test(id)) return { error: "Invalid request." };
    const { db, org, user } = await requirePermission(orgSlug, "deadlines.manage");
    const existing = id ? await db.deadline.findUnique({ where: { id } }) : null;
    if (id && !existing) return { error: "This deadline no longer exists. Refresh the page." };

    const now = new Date();
    if (existing?.ruleId) {
      const parsed = reminderSettingsSchema.safeParse({ reminderDays: formData.getAll("reminderDays") });
      if (!parsed.success) return fieldErrors(parsed.error);
      await db.$transaction(async (tx) => {
        await tx.deadline.update({ where: { id: existing.id }, data: { reminderDays: parsed.data.reminderDays } });
        await tx.reminder.deleteMany({ where: { deadlineId: existing.id, status: "SCHEDULED" } });
        await audit(tx, {
          organizationId: org.id,
          actorId: user.id,
          action: "deadline.reminders_update",
          entityType: "Deadline",
          entityId: existing.id,
          before: { reminderDays: existing.reminderDays },
          after: { reminderDays: parsed.data.reminderDays },
        });
      });
      await scheduleReminders(db, org, now, [existing.id]);
      return done(orgSlug, "Reminder settings saved.");
    }

    const parsed = deadlineSchema(now).safeParse(deadlineInput(formData));
    if (!parsed.success) return fieldErrors(parsed.error);
    const data = {
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      dueDate: parsed.data.dueDate,
      reminderDays: parsed.data.reminderDays,
    };

    const saved = await db.$transaction(async (tx) => {
      const deadline = existing
        ? await tx.deadline.update({ where: { id: existing.id }, data })
        : await tx.deadline.create({ data: { ...data, organizationId: org.id, createdById: user.id } });
      if (existing) await tx.reminder.deleteMany({ where: { deadlineId: existing.id, status: "SCHEDULED" } });
      await audit(tx, {
        organizationId: org.id,
        actorId: user.id,
        action: existing ? "deadline.update" : "deadline.create",
        entityType: "Deadline",
        entityId: deadline.id,
        before: existing ? { title: existing.title, dueDate: existing.dueDate, description: existing.description, reminderDays: existing.reminderDays } : undefined,
        after: data,
      });
      return deadline;
    });
    await Promise.all([scheduleReminders(db, org, now, [saved.id]), syncDeadlineAlerts(db, org, now)]);
    return done(orgSlug, existing ? "Deadline updated." : `“${data.title}” added to the calendar.`);
  } catch (error) {
    return handleActionError(error);
  }
}

/** Mark a deadline done (cancels its pending reminders) or reopen it. */
export async function setDeadlineDoneAction(orgSlug: string, id: string, isDone: boolean): Promise<ActionState> {
  try {
    if (!ID.test(id) || typeof isDone !== "boolean") return { error: "Invalid request." };
    const { db, org, user } = await requirePermission(orgSlug, "deadlines.manage");
    const existing = await db.deadline.findUnique({ where: { id } });
    if (!existing) return { error: "This deadline no longer exists. Refresh the page." };

    const now = new Date();
    await db.$transaction(async (tx) => {
      await tx.deadline.update({
        where: { id },
        data: isDone ? { status: "DONE", completedAt: now, completedById: user.id } : { status: "UPCOMING", completedAt: null, completedById: null },
      });
      if (isDone) await tx.reminder.updateMany({ where: { deadlineId: id, status: "SCHEDULED" }, data: { status: "CANCELLED" } });
      else await tx.reminder.deleteMany({ where: { deadlineId: id, status: "CANCELLED" } });
      await audit(tx, {
        organizationId: org.id,
        actorId: user.id,
        action: isDone ? "deadline.complete" : "deadline.reopen",
        entityType: "Deadline",
        entityId: id,
        before: { status: existing.status },
        after: { status: isDone ? "DONE" : "UPCOMING" },
      });
    });
    await Promise.all([isDone ? null : scheduleReminders(db, org, now, [id]), syncDeadlineAlerts(db, org, now)]);
    return done(orgSlug, isDone ? `“${existing.title}” marked as done.` : "Deadline reopened.");
  } catch (error) {
    return handleActionError(error);
  }
}

/** Delete a custom deadline. Statutory deadlines come from the regulation rules and cannot be deleted. */
export async function deleteDeadlineAction(orgSlug: string, id: string): Promise<ActionState> {
  try {
    if (!ID.test(id)) return { error: "Invalid request." };
    const { db, org, user } = await requirePermission(orgSlug, "deadlines.manage");
    const existing = await db.deadline.findUnique({ where: { id } });
    if (!existing) return { error: "This deadline no longer exists. Refresh the page." };
    if (existing.ruleId) return { error: "Statutory deadlines cannot be deleted. Mark it done once filed." };

    await db.$transaction(async (tx) => {
      await tx.deadline.delete({ where: { id } });
      await audit(tx, {
        organizationId: org.id,
        actorId: user.id,
        action: "deadline.delete",
        entityType: "Deadline",
        entityId: id,
        before: { title: existing.title, dueDate: existing.dueDate },
      });
    });
    await syncDeadlineAlerts(db, org);
    return done(orgSlug, "Deadline deleted.");
  } catch (error) {
    return handleActionError(error);
  }
}
