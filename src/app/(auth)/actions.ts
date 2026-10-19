"use server";

import { hash } from "@node-rs/argon2";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import { fieldErrors, handleActionError, type ActionState } from "@/lib/actions";
import { prisma } from "@/lib/db/client";
import { LIMITS, rateLimit, resetRateLimit } from "@/lib/security/rate-limit";
import { getClientIp } from "@/lib/security/request";
import { loginSchema, safeCallbackUrl, signupSchema } from "@/lib/validation/auth";

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

export async function googleSignInAction(formData: FormData) {
  await signIn("google", { redirectTo: safeCallbackUrl(formData.get("callbackUrl")) });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}
