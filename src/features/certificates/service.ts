import "server-only";
import type { TenantDb } from "@/lib/db/tenant";

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Awaiting approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};
export const TYPE_LABELS: Record<string, string> = { RECYCLING: "Recycling", END_OF_LIFE: "End of life" };
export const FLAG_LABELS: Record<string, string> = {
  DUPLICATE_NUMBER: "Duplicate number",
  DUPLICATE_CROSS_TENANT: "Claimed elsewhere",
  DUPLICATE_FILE: "Duplicate file",
  UNVERIFIED_RECYCLER: "Recycler status",
  CAPACITY_EXCEEDED: "Capacity exceeded",
  SUSPICIOUS_DATE: "Suspicious dates",
  PRICE_OUTLIER: "Unusual price",
  CATEGORY_MISMATCH: "Category not registered",
};

/** Keeps one "N certificates awaiting approval" alert in step with the queue. */
export async function syncApprovalAlert(db: TenantDb, organizationId: string, _orgSlug: string, now = new Date()) {
  const pending = await db.certificate.count({ where: { deletedAt: null, status: "PENDING_APPROVAL" } });
  const dedupeKey = "certificates:pending-approval";
  const existing = await db.alert.findFirst({ where: { dedupeKey } });
  if (pending === 0) {
    if (existing && !existing.resolvedAt) await db.alert.update({ where: { id: existing.id }, data: { resolvedAt: now } });
    return;
  }
  const title = `${pending} certificate${pending === 1 ? "" : "s"} awaiting approval`;
  const data = { severity: "INFO" as const, title, body: "An Admin needs to review the checks and approve or reject them.", link: "certificates?status=PENDING_APPROVAL" };
  if (!existing) await db.alert.create({ data: { organizationId, dedupeKey, ...data } });
  else if (existing.title !== title || existing.resolvedAt) await db.alert.update({ where: { id: existing.id }, data: { ...data, resolvedAt: null, readAt: null } });
}
