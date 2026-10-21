import "server-only";
import { syncDeadlines } from "@/features/calendar/service";
import { computeCompliance, syncCompliance } from "@/features/compliance/service";
import { prisma } from "@/lib/db/client";
import { getTenantDb } from "@/lib/db/tenant";
import { financialYearOf } from "@/lib/domain/financial-year";
import { refreshOpenCertificates } from "@/lib/fraud/service";

/**
 * Cron job: for every organisation, recompute the current FY and refresh alerts,
 * bring the deadline calendar and its reminders up to date, and re-run fraud checks
 * on certificates that are still open.
 */
export async function recalculateAllOrganizations(today = new Date()) {
  const orgs = await prisma.organization.findMany({
    where: { deletedAt: null },
    select: { id: true, wasteStreams: true },
  });
  const fy = financialYearOf(today);
  let ok = 0;
  const failed: string[] = [];
  for (const org of orgs) {
    try {
      const db = getTenantDb(org.id);
      await syncCompliance(db, org, await computeCompliance(db, org, fy, today), today);
      await syncDeadlines(db, org, today);
      ok++;
    } catch (error) {
      console.error(`[cron:compliance] org ${org.id} failed`, error);
      failed.push(org.id);
    }
  }
  // Capacity and cross-tenant duplicates change as other organisations add certificates.
  const recheckedCertificates = await refreshOpenCertificates(getTenantDb, today);
  return { financialYear: fy, organizations: orgs.length, ok, failed, recheckedCertificates };
}
