import "server-only";
import type { OrgContext } from "@/lib/auth/session";
import { recentFinancialYears } from "@/lib/domain/financial-year";
import type { CertificateFormOptions } from "./certificate-form";

export async function loadCertificateOptions(ctx: OrgContext): Promise<CertificateFormOptions> {
  const [recyclers, categories] = await Promise.all([
    ctx.db.recycler.findMany({
      select: { id: true, name: true, cpcbRegistrationNo: true, stateCode: true, verificationStatus: true, organizationId: true },
      orderBy: { name: "asc" },
    }),
    ctx.db.materialCategory.findMany({
      where: { active: true, stream: { in: ctx.org.wasteStreams } },
      select: { id: true, name: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);
  return {
    recyclers: recyclers.map((r) => ({
      id: r.id,
      name: r.name,
      registrationNo: r.cpcbRegistrationNo,
      stateCode: r.stateCode,
      status: r.verificationStatus,
      own: r.organizationId !== null,
    })),
    categories,
    years: recentFinancialYears(new Date(), 4),
  };
}
