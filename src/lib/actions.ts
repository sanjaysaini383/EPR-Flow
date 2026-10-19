import "server-only";
import { randomUUID } from "node:crypto";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { ForbiddenError } from "@/lib/auth/session";
import { TenantScopeError } from "@/lib/db/tenant-scope";
import { RateLimitError } from "@/lib/security/rate-limit";

export type ActionState = {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

export function fieldErrors(error: z.ZodError): ActionState {
  const errors = z.flattenError(error).fieldErrors as Record<string, string[]>;
  const count = Object.keys(errors).length;
  return {
    error: count === 1 ? "Please fix the highlighted field." : `Please fix the ${count} highlighted fields.`,
    fieldErrors: errors,
  };
}

/**
 * Turns any error thrown inside a server action into a safe, user-readable ActionState.
 * - Next.js control flow (redirect / notFound) is re-thrown untouched.
 * - Known errors get a specific message.
 * - Anything else is logged server-side with a reference id; the user only sees the id,
 *   never stack traces, SQL or internal details.
 */
export function handleActionError(error: unknown): ActionState {
  unstable_rethrow(error);

  if (error instanceof ForbiddenError) return { error: error.message };
  if (error instanceof RateLimitError) return { error: error.message };

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return { error: "This record already exists." };
    if (error.code === "P2025") return { error: "This record no longer exists. Refresh the page and try again." };
  }

  const ref = randomUUID().slice(0, 8);
  if (error instanceof TenantScopeError) console.error(`[action:${ref}] tenant scope violation`, error);
  else console.error(`[action:${ref}]`, error);
  return { error: `Something went wrong on our side. Please try again (ref ${ref}).` };
}
