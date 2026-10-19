import "server-only";
import { z } from "zod";

/**
 * Validates server environment once at startup so misconfiguration fails fast with a
 * readable message instead of a cryptic runtime error deep inside a request.
 */
const schema = z.object({
  DATABASE_URL: z
    .string({ message: "is required (Neon pooled connection string)" })
    .refine((v) => v.startsWith("postgres://") || v.startsWith("postgresql://"), "must be a postgres:// URL")
    .refine((v) => !v.includes("USER:PASSWORD@ep-xxxx"), "still contains the placeholder from .env.example"),
  AUTH_SECRET: z
    .string({ message: "is required — generate one with `npx auth secret`" })
    .min(32, "must be at least 32 characters — generate one with `npx auth secret`")
    .refine((v) => v !== "replace-me", "still has the placeholder value"),
  APP_URL: z.url().optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

function load() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  • ${i.path.join(".")} ${i.message}`);
    throw new Error(`Invalid environment configuration (check your .env / Vercel env vars):\n${lines.join("\n")}`);
  }
  return parsed.data;
}

export const env = load();
