import "server-only";
import { prisma } from "@/lib/db/client";
import { median } from "@/lib/domain/fraud/checks";

/**
 * Platform-wide recycler figures shown in the directory. Aggregates only: totals,
 * a utilisation share, a median price and an average rating — never another
 * organisation's certificates or ratings.
 */
export async function recyclerPlatformStats(recyclerIds: string[], financialYear: string) {
  if (!recyclerIds.length) return new Map<string, { ratingAvg: number | null; ratingCount: number; certifiedKg: number }>();
  const [ratings, certified] = await Promise.all([
    prisma.recyclerRating.groupBy({ by: ["recyclerId"], where: { recyclerId: { in: recyclerIds } }, _avg: { rating: true }, _count: true }),
    prisma.certificate.groupBy({
      by: ["recyclerId"],
      where: { recyclerId: { in: recyclerIds }, financialYear, deletedAt: null, status: { not: "REJECTED" } },
      _sum: { quantityKg: true },
    }),
  ]);
  return new Map(
    recyclerIds.map((id) => {
      const r = ratings.find((x) => x.recyclerId === id);
      return [
        id,
        {
          ratingAvg: r?._avg.rating ?? null,
          ratingCount: r?._count ?? 0,
          certifiedKg: Number(certified.find((x) => x.recyclerId === id)?._sum.quantityKg ?? 0),
        },
      ];
    }),
  );
}

/** Capacity per category for one recycler and FY, with the platform-wide share already certified. */
export async function recyclerCapacityUse(recyclerId: string, financialYear: string) {
  const [capacities, certified, prices] = await Promise.all([
    prisma.recyclerCapacity.findMany({ where: { recyclerId, financialYear }, include: { category: { select: { name: true, sortOrder: true } } } }),
    prisma.certificate.groupBy({
      by: ["categoryId"],
      where: { recyclerId, financialYear, deletedAt: null, status: { not: "REJECTED" } },
      _sum: { quantityKg: true },
    }),
    prisma.certificate.findMany({
      where: { recyclerId, financialYear, deletedAt: null, status: "APPROVED", pricePerKgInr: { not: null } },
      select: { categoryId: true, pricePerKgInr: true },
      take: 5000,
    }),
  ]);
  return capacities
    .sort((a, b) => a.category.sortOrder - b.category.sortOrder)
    .map((c) => {
      const used = Number(certified.find((x) => x.categoryId === c.categoryId)?._sum.quantityKg ?? 0);
      const capacityKg = Number(c.annualCapacityKg);
      const sample = prices.filter((p) => p.categoryId === c.categoryId).map((p) => Number(p.pricePerKgInr));
      return {
        categoryId: c.categoryId,
        category: c.category.name,
        capacityKg,
        certifiedKg: used,
        utilisation: capacityKg > 0 ? used / capacityKg : null,
        // Only shown with enough samples that no single buyer's price can be inferred.
        medianPricePerKg: sample.length >= 3 ? median(sample) : null,
      };
    });
}
