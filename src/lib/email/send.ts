import "server-only";
import nodemailer from "nodemailer";

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!process.env.SMTP_HOST) return null;
  transporter ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
  });
  return transporter;
}

/** Sends an email; returns false (and logs) instead of throwing so callers can degrade gracefully. */
export async function sendEmail(message: { to: string; subject: string; text: string; html?: string }) {
  const t = getTransporter();
  if (!t) {
    console.info(`[email] SMTP not configured — would send "${message.subject}" to ${message.to}`);
    return false;
  }
  try {
    await t.sendMail({ from: process.env.EMAIL_FROM ?? "EPRFlow <no-reply@eprflow.local>", ...message });
    return true;
  } catch (error) {
    console.error("[email] send failed", error);
    return false;
  }
}

export function appUrl(path: string) {
  return new URL(path, process.env.APP_URL ?? "http://localhost:3000").toString();
}
