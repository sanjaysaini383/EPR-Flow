import { describeDaysLeft } from "./schedule";

const dateFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function formatDueDate(date: Date): string {
  return dateFormat.format(date);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

type ReminderInput = {
  organizationName: string;
  title: string;
  description: string | null;
  dueDate: Date;
  daysLeft: number;
  url: string;
};

/** The reminder email. Every user-supplied value is escaped in the HTML part. */
export function reminderEmail(input: ReminderInput): { subject: string; text: string; html: string } {
  const due = formatDueDate(input.dueDate);
  const when = describeDaysLeft(input.daysLeft);
  const subject = `Reminder: ${input.title} — ${when} (${due})`;
  const lines = [
    `${input.organizationName}`,
    "",
    `${input.title} is ${when === "due today" ? "due today" : `due on ${due} (${when})`}.`,
    ...(input.description ? ["", input.description] : []),
    "",
    `Open the compliance calendar: ${input.url}`,
    "",
    "You receive this because you are an Admin or Compliance Manager in EPRFlow.",
  ];
  const html = `<div style="font-family:system-ui,Segoe UI,sans-serif;font-size:15px;line-height:1.5;color:#111">
  <p style="color:#555;margin:0 0 8px">${escapeHtml(input.organizationName)}</p>
  <p style="font-size:18px;font-weight:600;margin:0 0 4px">${escapeHtml(input.title)}</p>
  <p style="margin:0 0 16px">Due <strong>${escapeHtml(due)}</strong> — ${escapeHtml(when)}</p>
  ${input.description ? `<p style="margin:0 0 16px">${escapeHtml(input.description)}</p>` : ""}
  <p><a href="${escapeHtml(input.url)}" style="background:#15803d;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Open compliance calendar</a></p>
  <p style="color:#777;font-size:12px;margin-top:24px">You receive this because you are an Admin or Compliance Manager in EPRFlow.</p>
</div>`;
  return { subject, text: lines.join("\n"), html };
}

/** Plain text ready to paste into WhatsApp, plus a wa.me share link (no number: the user picks the chat). */
export function whatsappMessage(input: Omit<ReminderInput, "url"> & { url?: string }): { text: string; link: string } {
  const text = [
    `*${input.title}*`,
    `${input.organizationName} — due ${formatDueDate(input.dueDate)} (${describeDaysLeft(input.daysLeft)})`,
    ...(input.description ? [input.description] : []),
    ...(input.url ? [input.url] : []),
  ].join("\n");
  return { text, link: `https://wa.me/?text=${encodeURIComponent(text)}` };
}
