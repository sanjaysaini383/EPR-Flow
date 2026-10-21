import { timingSafeEqual } from "node:crypto";
import { recalculateAllOrganizations } from "@/lib/jobs/compliance";
import { sendDueReminders } from "@/lib/jobs/reminders";

export const maxDuration = 300;

/**
 * Daily job (07:00 IST). Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`.
 * Recalculates every organisation, refreshes the deadline calendar, then sends due reminders.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const authorised =
    !!secret && header.length === expected.length && timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  if (!authorised) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const compliance = await recalculateAllOrganizations();
  const reminders = await sendDueReminders();
  return Response.json({ ...compliance, reminders });
}
