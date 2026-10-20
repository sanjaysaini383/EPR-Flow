import "server-only";
import { prisma } from "@/lib/db/client";

export class RateLimitError extends Error {
  constructor(public retryAfterSeconds: number) {
    super(`Too many attempts. Please try again in ${formatWait(retryAfterSeconds)}.`);
  }
}

function formatWait(seconds: number) {
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

export const LIMITS = {
  loginPerIp: { limit: 20, windowSeconds: 15 * 60 },
  loginPerEmail: { limit: 8, windowSeconds: 15 * 60 },
  signupPerIp: { limit: 5, windowSeconds: 60 * 60 },
  invitePerOrg: { limit: 30, windowSeconds: 60 * 60 },
  acceptInvitePerIp: { limit: 20, windowSeconds: 15 * 60 },
  importPerOrg: { limit: 60, windowSeconds: 60 * 60 },
} as const;

type Limit = { limit: number; windowSeconds: number };

/**
 * Atomic fixed-window counter in Postgres (single statement, safe under concurrency).
 * Throws RateLimitError once `limit` is exceeded within the window.
 */
export async function rateLimit(key: string, { limit, windowSeconds }: Limit): Promise<void> {
  const rows = await prisma.$queryRaw<{ count: number; windowStart: Date }[]>`
    INSERT INTO "RateLimit" ("key", "count", "windowStart")
    VALUES (${key}, 1, now())
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."windowStart" < now() - make_interval(secs => ${windowSeconds})
                     THEN 1 ELSE "RateLimit"."count" + 1 END,
      "windowStart" = CASE WHEN "RateLimit"."windowStart" < now() - make_interval(secs => ${windowSeconds})
                           THEN now() ELSE "RateLimit"."windowStart" END
    RETURNING "count", "windowStart"`;

  const { count, windowStart } = rows[0];
  if (count > limit) {
    const retryAfter = Math.max(1, Math.ceil((windowStart.getTime() + windowSeconds * 1000 - Date.now()) / 1000));
    throw new RateLimitError(retryAfter);
  }

  // Opportunistic cleanup (~1% of calls) so the table never grows unbounded.
  if (Math.random() < 0.01) {
    await prisma.$executeRaw`DELETE FROM "RateLimit" WHERE "windowStart" < now() - interval '1 day'`;
  }
}

/** Clears a counter, e.g. after a successful login. */
export async function resetRateLimit(key: string) {
  await prisma.rateLimit.deleteMany({ where: { key } });
}
