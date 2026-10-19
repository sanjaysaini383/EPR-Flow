import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { getRequestMeta } from "@/lib/security/request";

/** Any client or transaction that can write audit logs (tenant client, or base client in onboarding). */
type AuditClient = { auditLog: { create(args: { data: Prisma.AuditLogUncheckedCreateInput }): Promise<unknown> } };

export type AuditEntry = {
  organizationId: string;
  actorId: string | null;
  action: string; // "<entity>.<verb>", e.g. "member.role_change"
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
};

const SENSITIVE_KEYS = new Set(["passwordHash", "password", "tokenHash", "token", "access_token", "refresh_token", "id_token"]);

/**
 * Append an audit record with the caller's IP and user agent. Pass the transaction
 * client when the change runs in a transaction so the log and the change commit together.
 */
export async function audit(db: AuditClient, entry: AuditEntry) {
  const { ip, userAgent } = await getRequestMeta();
  await db.auditLog.create({
    data: {
      organizationId: entry.organizationId,
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: toJson(entry.before),
      after: toJson(entry.after),
      ip,
      userAgent,
    },
  });
}

/** Serialises to JSON and strips secrets so they can never end up in the audit trail. */
function toJson(value: unknown) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value, (key, v) => (SENSITIVE_KEYS.has(key) ? undefined : v)));
}
