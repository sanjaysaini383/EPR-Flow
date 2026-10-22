"use server";

import { createHash, randomBytes } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import { fieldErrors, handleActionError, type ActionState } from "@/lib/actions";
import { prisma } from "@/lib/db/client";
import { LIMITS, rateLimit, resetRateLimit } from "@/lib/security/rate-limit";
import { getClientIp } from "@/lib/security/request";
import { audit } from "@/lib/audit";
import { appUrl, sendEmail } from "@/lib/email/send";
import { forgotPasswordSchema, loginSchema, resetPasswordSchema, safeCallbackUrl, signupSchema } from "@/lib/validation/auth";

const RESET_TTL_MS = 60 * 60 * 1000;
const resetIdentifier = (userId: string) => `password-reset:${userId}`;
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
const RESET_SENT = "If an account exists for this email, a link to reset the password is on its way. It expires in 1 hour.";

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrors(parsed.error);
  const emailKey = `login:email:${parsed.data.email}`;

  try {
    const ip = await getClientIp();
    await rateLimit(`login:ip:${ip}`, LIMITS.loginPerIp);
    await rateLimit(emailKey, LIMITS.loginPerEmail);

    await signIn("credentials", {
      ...parsed.data,
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) return { error: "Incorrect email or password." };
    return handleActionError(error);
  }

  await resetRateLimit(emailKey);
  // Redirect outside the try so it is not mistaken for an error.
  redirect(safeCallbackUrl(formData.get("callbackUrl")));
}

export async function signupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrors(parsed.error);
  const { name, email, password } = parsed.data;

  try {
    await rateLimit(`signup:ip:${await getClientIp()}`, LIMITS.signupPerIp);

    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      return {
        error: "Please fix the highlighted field.",
        fieldErrors: { email: ["An account with this email already exists. Log in instead."] },
      };
    }

    await prisma.user.create({ data: { name, email, passwordHash: await hash(password) } });
    await signIn("credentials", { email, password, redirect: false });
  } catch (error) {
    if (error instanceof AuthError) return { error: "Your account was created, but sign-in failed. Please log in." };
    return handleActionError(error);
  }

  redirect(safeCallbackUrl(formData.get("callbackUrl"), "/onboarding"));
}

/**
 * Emails a one-time reset link. The response is the same whether or not the email
 * is registered, so the form cannot be used to discover accounts. Only a hash of the
 * token is stored.
 */
export async function requestPasswordResetAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = forgotPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrors(parsed.error);
  const { email } = parsed.data;
  try {
    await rateLimit(`reset:ip:${await getClientIp()}`, LIMITS.passwordResetPerIp);
    await rateLimit(`reset:email:${email}`, LIMITS.passwordResetPerEmail);

    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true } });
    if (user) {
      const token = randomBytes(32).toString("base64url");
      await prisma.$transaction([
        prisma.verificationToken.deleteMany({ where: { identifier: resetIdentifier(user.id) } }),
        prisma.verificationToken.create({ data: { identifier: resetIdentifier(user.id), token: sha256(token), expires: new Date(Date.now() + RESET_TTL_MS) } }),
      ]);
      const link = appUrl(`/reset-password?token=${token}`);
      await sendEmail({
        to: email,
        subject: "Reset your EPRFlow password",
        text: [
          `Hi${user.name ? ` ${user.name}` : ""},`,
          "",
          "Use this link to choose a new password. It works once and expires in 1 hour:",
          link,
          "",
          "If you did not ask for this, ignore this email; your password stays the same.",
        ].join("\n"),
      });
      // Without SMTP in development, print the link so the flow can still be tested.
      if (!process.env.SMTP_HOST && process.env.NODE_ENV !== "production") console.info(`[email] password reset link for ${email}: ${link}`);
    }
  } catch (error) {
    return handleActionError(error);
  }
  return { ok: true, message: RESET_SENT };
}

/** Sets a new password from a reset link and signs the user out of every other session. */
export async function resetPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = resetPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrors(parsed.error);
  const { token, password } = parsed.data;
  try {
    await rateLimit(`reset:ip:${await getClientIp()}`, LIMITS.passwordResetPerIp);
    const record = await prisma.verificationToken.findUnique({ where: { token: sha256(token) } });
    if (!record || !record.identifier.startsWith("password-reset:") || record.expires < new Date()) {
      if (record) await prisma.verificationToken.delete({ where: { token: record.token } }).catch(() => {});
      return { error: "This reset link is invalid or has expired. Request a new one." };
    }
    const userId = record.identifier.slice("password-reset:".length);
    const passwordHash = await hash(password);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash, passwordChangedAt: new Date() } });
      await tx.verificationToken.deleteMany({ where: { identifier: record.identifier } });
      await audit(tx, { organizationId: null, actorId: userId, action: "user.password_reset", entityType: "User", entityId: userId });
    });
  } catch (error) {
    return handleActionError(error);
  }
  redirect("/login?reset=1");
}

export async function googleSignInAction(formData: FormData) {
  await signIn("google", { redirectTo: safeCallbackUrl(formData.get("callbackUrl")) });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}
