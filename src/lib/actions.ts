import "server-only";
import { z } from "zod";
import { ForbiddenError } from "@/lib/auth/session";
import { TenantScopeError } from "@/lib/db/tenant-scope";

export type ActionState = {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

export function fieldErrors(error: z.ZodError): ActionState {
  return {
    error: "Please fix the highlighted fields.",
    fieldErrors: z.flattenError(error).fieldErrors as Record<string, string[]>,
  };
}

/** Converts known errors into an ActionState; rethrows anything else (including Next redirects). */
export function handleActionError(error: unknown): ActionState {
  if (error instanceof ForbiddenError) return { error: error.message };
  if (error instanceof TenantScopeError) {
    console.error(error);
    return { error: "Something went wrong." };
  }
  throw error;
}
