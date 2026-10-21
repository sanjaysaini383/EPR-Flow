import "server-only";
import { REMINDER_ROLES } from "@/features/calendar/service";
import { prisma } from "@/lib/db/client";
import { reminderEmail } from "@/lib/domain/deadlines/messages";
import { daysUntil, istToday } from "@/lib/domain/deadlines/schedule";
import { appUrl, sendEmail } from "@/lib/email/send";

const BATCH = 500;

/**
 * Sends every email reminder that is due. Each reminder is claimed with a
 * conditional update (SCHEDULED → SENT) before sending, so overlapping runs never
 * send the same reminder twice. Reminders whose deadline is done or past, or whose
 * recipient is no longer an Admin/Compliance Manager, are cancelled instead.
 */
export async function sendDueReminders(now = new Date()) {
  const due = await prisma.reminder.findMany({
    where: { status: "SCHEDULED", channel: "EMAIL", sendAt: { lte: now } },
    orderBy: { sendAt: "asc" },
    take: BATCH,
    include: {
      deadline: { select: { title: true, description: true, dueDate: true, status: true } },
      organization: { select: { id: true, name: true, slug: true, deletedAt: true } },
    },
  });

  const memberships = await prisma.membership.findMany({
    where: { organizationId: { in: [...new Set(due.map((r) => r.organizationId))] }, role: { in: [...REMINDER_ROLES] } },
    select: { organizationId: true, user: { select: { email: true } } },
  });
  const allowed = new Set(memberships.map((m) => `${m.organizationId}|${m.user.email.toLowerCase()}`));

  const result = { due: due.length, sent: 0, failed: 0, cancelled: 0 };
  for (const r of due) {
    const stillValid =
      !r.organization.deletedAt &&
      r.deadline.status === "UPCOMING" &&
      r.deadline.dueDate >= istToday(now) &&
      allowed.has(`${r.organizationId}|${r.recipient.toLowerCase()}`);
    if (!stillValid) {
      await prisma.reminder.updateMany({ where: { id: r.id, status: "SCHEDULED" }, data: { status: "CANCELLED" } });
      result.cancelled++;
      continue;
    }

    const claimed = await prisma.reminder.updateMany({ where: { id: r.id, status: "SCHEDULED" }, data: { status: "SENT", sentAt: now } });
    if (claimed.count === 0) continue; // another run took it

    const message = reminderEmail({
      organizationName: r.organization.name,
      title: r.deadline.title,
      description: r.deadline.description,
      dueDate: r.deadline.dueDate,
      daysLeft: daysUntil(r.deadline.dueDate, now),
      url: appUrl(`/o/${r.organization.slug}/calendar`),
    });
    const delivered = await sendEmail({ to: r.recipient, ...message });
    if (delivered) {
      result.sent++;
    } else {
      result.failed++;
      await prisma.reminder.update({
        where: { id: r.id },
        data: { status: "FAILED", error: process.env.SMTP_HOST ? "The mail server rejected the message" : "Email is not configured (SMTP_HOST is unset)" },
      });
    }
  }
  return result;
}
