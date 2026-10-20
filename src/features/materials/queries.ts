import "server-only";
import type { TenantDb } from "@/lib/db/tenant";
import type { ImportContext } from "@/lib/domain/materials/import";

type Org = { entityTypes: string[]; wasteStreams: string[] };

/** Reference data used by the entry form and the importer: only active, enabled records. */
export async function loadMaterialContext(db: TenantDb, org: Org): Promise<ImportContext> {
  const [categories, brands, plants, gstins] = await Promise.all([
    db.materialCategory.findMany({
      where: { active: true, stream: { in: org.wasteStreams as never } },
      select: { id: true, code: true, name: true, stream: true },
      orderBy: { sortOrder: "asc" },
    }),
    db.brand.findMany({ where: { archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.plant.findMany({ where: { archivedAt: null }, select: { id: true, name: true, stateCode: true }, orderBy: { name: "asc" } }),
    db.gstRegistration.findMany({
      where: { archivedAt: null },
      select: { id: true, gstin: true, stateCode: true },
      orderBy: { stateCode: "asc" },
    }),
  ]);
  return {
    categories,
    enabledStreams: org.wasteStreams,
    entityTypes: org.entityTypes,
    brands,
    plants,
    gstins,
    today: new Date(),
  };
}

/** Identity of an entry for duplicate detection (one row per month × category × entity × place). */
export function entryKey(e: {
  periodMonth: Date | string;
  categoryId: string;
  entityType: string;
  stateCode: string;
  brandId: string | null;
  plantId: string | null;
  gstRegistrationId: string | null;
}) {
  const month = typeof e.periodMonth === "string" ? e.periodMonth.slice(0, 7) : e.periodMonth.toISOString().slice(0, 7);
  return [month, e.categoryId, e.entityType, e.stateCode, e.brandId ?? "", e.plantId ?? "", e.gstRegistrationId ?? ""].join("|");
}

/** Keys of existing (non-deleted) entries in the given months, for duplicate checks. */
export async function existingEntryKeys(db: TenantDb, months: string[], excludeId?: string) {
  if (months.length === 0) return new Set<string>();
  const entries = await db.materialEntry.findMany({
    where: {
      deletedAt: null,
      periodMonth: { in: [...new Set(months)].map((m) => new Date(`${m.slice(0, 7)}-01T00:00:00Z`)) },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: {
      periodMonth: true,
      categoryId: true,
      entityType: true,
      stateCode: true,
      brandId: true,
      plantId: true,
      gstRegistrationId: true,
    },
  });
  return new Set(entries.map(entryKey));
}
