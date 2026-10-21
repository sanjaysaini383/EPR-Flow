import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const IST_OFFSET_MS = 330 * 60_000;

const filterSchema = z.object({
  entity: z
    .string()
    .regex(/^[A-Za-z]{2,40}$/)
    .optional()
    .catch(undefined),
  actor: z
    .string()
    .regex(/^[a-z0-9]{10,40}$/i)
    .optional()
    .catch(undefined),
  from: z.string().regex(DATE).optional().catch(undefined),
  to: z.string().regex(DATE).optional().catch(undefined),
});

export type AuditFilters = z.infer<typeof filterSchema>;

/** Reads filters from the query string; anything malformed is ignored rather than erroring. */
export function parseAuditFilters(params: Record<string, string | string[] | undefined>): AuditFilters {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
  return filterSchema.parse({ entity: first(params.entity), actor: first(params.actor), from: first(params.from), to: first(params.to) });
}

/** IST calendar date "2026-10-20" → UTC instant of local midnight. */
function istMidnight(date: string, addDays = 0): Date | null {
  const [y, m, d] = date.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d + addDays);
  if (Number.isNaN(utc)) return null;
  return new Date(utc - IST_OFFSET_MS);
}

export function auditWhere(f: AuditFilters): Prisma.AuditLogWhereInput {
  const from = f.from ? istMidnight(f.from) : null;
  const to = f.to ? istMidnight(f.to, 1) : null; // inclusive end date
  return {
    ...(f.entity ? { entityType: f.entity } : {}),
    ...(f.actor ? { actorId: f.actor } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
  };
}

export function filterQuery(f: AuditFilters): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) q.set(k, v);
  return q.toString();
}
