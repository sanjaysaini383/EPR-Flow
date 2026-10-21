import "server-only";
import { computeCompliance } from "@/features/compliance/service";
import { getTenantDb } from "@/lib/db/tenant";
import { istToday } from "@/lib/domain/deadlines/schedule";
import { financialYearOf } from "@/lib/domain/financial-year";
import type { ObligationStatus } from "@/lib/domain/obligations/calculate";
import { can, type Role } from "@/lib/domain/permissions";

export type ClientSummary = {
  id: string;
  slug: string;
  name: string;
  role: Role;
  score: number | null;
  status: ObligationStatus;
  targetKg: number;
  remainingKg: number;
  ecRiskInr: number | null; // null when the role cannot see costs
  atRisk: string[];
  criticalAlerts: number;
  pendingApprovals: number;
  highFlags: number;
  nextDeadline: { title: string; dueDate: Date } | null;
  overdueDeadlines: number;
  lastActivity: Date | null;
};

/**
 * One row per organisation the user belongs to, each loaded through that
 * organisation's own tenant-scoped client — nothing crosses tenants here.
 */
export async function loadClientSummaries(memberships: { id: string; slug: string; name: string; role: Role }[], now = new Date()): Promise<ClientSummary[]> {
  const fy = financialYearOf(now);
  const today = istToday(now);
  return Promise.all(
    memberships.map(async (m) => {
      const db = getTenantDb(m.id);
      const org = await db.organization.findFirstOrThrow({ select: { id: true, wasteStreams: true } });
      const [result, criticalAlerts, pendingApprovals, highFlags, nextDeadline, overdueDeadlines, lastActivity] = await Promise.all([
        computeCompliance(db, org, fy, now),
        db.alert.count({ where: { resolvedAt: null, severity: "CRITICAL" } }),
        db.certificate.count({ where: { deletedAt: null, status: "PENDING_APPROVAL" } }),
        db.certificateFlag.count({ where: { status: "OPEN", severity: "HIGH" } }),
        db.deadline.findFirst({ where: { status: "UPCOMING", dueDate: { gte: today } }, orderBy: { dueDate: "asc" }, select: { title: true, dueDate: true } }),
        db.deadline.count({ where: { status: "UPCOMING", dueDate: { lt: today } } }),
        db.auditLog.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
      ]);
      const status: ObligationStatus =
        result.score === null
          ? "NO_OBLIGATION"
          : result.lines.some((l) => l.status === "AT_RISK")
            ? "AT_RISK"
            : result.lines.some((l) => l.status === "BEHIND")
              ? "BEHIND"
              : result.score >= 1
                ? "MET"
                : "ON_TRACK";
      return {
        id: m.id,
        slug: m.slug,
        name: m.name,
        role: m.role,
        score: result.score,
        status,
        targetKg: result.totals.targetKg,
        remainingKg: result.totals.shortfallKg,
        ecRiskInr: can(m.role, "costs.view") ? result.totals.estimatedEcInr : null,
        atRisk: result.lines.filter((l) => l.status === "AT_RISK" || l.status === "BEHIND").map((l) => l.category.name.split(" – ")[0]),
        criticalAlerts,
        pendingApprovals,
        highFlags,
        nextDeadline,
        overdueDeadlines,
        lastActivity: lastActivity?.createdAt ?? null,
      };
    }),
  );
}
