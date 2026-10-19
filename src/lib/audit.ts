import "server-only";
import type { Prisma } from "@/generated/prisma/client";

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

/**
 * Append an audit record. Pass the transaction client when the change itself
 * runs in a transaction so the log and the change commit together.
 */
export async function audit(db: AuditClient, entry: AuditEntry) {
  await db.auditLog.create({
    data: {
      organizationId: entry.organizationId,
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: toJson(entry.before),
      after: toJson(entry.after),
    },
  });
}

function toJson(value: unknown) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
