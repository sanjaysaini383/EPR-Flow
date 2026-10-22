import { z } from "zod";
import { text } from "./common";

export const emailSchema = z
  .string({ message: "Email is required" })
  .trim()
  .toLowerCase()
  .min(1, "Email is required")
  .max(254, "Email is too long")
  .pipe(z.email("Enter a valid email address, e.g. name@company.com"));

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string({ message: "Password is required" }).min(1, "Password is required").max(128, "Password is too long"),
});

const COMMON_PASSWORDS = new Set([
  "password1234",
  "password@123",
  "qwerty123456",
  "1234567890ab",
  "welcome@1234",
  "admin@123456",
  "india@123456",
]);

export const passwordSchema = z
  .string({ message: "Password is required" })
  .min(10, "Use at least 10 characters")
  .max(128, "Use at most 128 characters")
  .regex(/[a-zA-Z]/, "Include at least one letter")
  .regex(/[0-9]/, "Include at least one number")
  .refine((v) => !COMMON_PASSWORDS.has(v.toLowerCase()), "This password is too common — choose another");

export const signupSchema = z
  .object({
    name: text("Full name", { min: 2, max: 100 }),
    email: emailSchema,
    password: passwordSchema,
  })
  .refine((d) => !d.password.toLowerCase().includes(d.email.split("@")[0]), {
    path: ["password"],
    message: "Password must not contain your email name",
  });

/** Only allow same-site relative redirects (blocks open-redirects like //evil.com or /\evil.com). */
export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/, "This reset link is invalid. Request a new one."),
  password: passwordSchema,
});

export function safeCallbackUrl(value: unknown, fallback = "/o"): string {
  return typeof value === "string" && /^\/(?![/\\])/.test(value) ? value : fallback;
}
