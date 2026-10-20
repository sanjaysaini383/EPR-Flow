import "server-only";
import { computeCompliance, syncCompliance } from "@/features/compliance/service";
import { prisma } from "@/lib/db/client";
import { getTenantDb } from "@/lib/db/tenant";
import { financialYearOf } from "@/lib/domain/financial-year";

/** Cron job: recompute the current FY for every organisation and refresh alerts. */
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
      ok++;
    } catch (error) {
      console.error(`[cron:compliance] org ${org.id} failed`, error);
      failed.push(org.id);
    }
  }
  return { financialYear: fy, organizations: orgs.length, ok, failed };
}
