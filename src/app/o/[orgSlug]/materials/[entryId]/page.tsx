import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { MaterialEntryForm } from "@/features/materials/entry-form";
import { loadMaterialContext } from "@/features/materials/queries";
import { getOrgContext } from "@/lib/auth/session";
import { monthKey, startOfMonth } from "@/lib/domain/financial-year";

export const metadata: Metadata = { title: "Edit material entry" };

export default async function EditMaterialEntryPage({ params }: PageProps<"/o/[orgSlug]/materials/[entryId]">) {
  const { orgSlug, entryId } = await params;
  const { db, org, can } = await getOrgContext(orgSlug);
  if (!can("data.write")) redirect(`/o/${orgSlug}/materials`);

  const entry = await db.materialEntry.findFirst({ where: { id: entryId, deletedAt: null } });
  if (!entry) notFound();

  const options = await loadMaterialContext(db, org);
  // Keep archived references the entry already uses selectable.
  const [category, brand, plant, gst] = await Promise.all([
    options.categories.some((c) => c.id === entry.categoryId)
      ? null
      : db.materialCategory.findUnique({ where: { id: entry.categoryId }, select: { id: true, code: true, name: true, stream: true } }),
    entry.brandId && !options.brands.some((b) => b.id === entry.brandId)
      ? db.brand.findUnique({ where: { id: entry.brandId }, select: { id: true, name: true } })
      : null,
    entry.plantId && !options.plants.some((p) => p.id === entry.plantId)
      ? db.plant.findUnique({ where: { id: entry.plantId }, select: { id: true, name: true, stateCode: true } })
      : null,
    entry.gstRegistrationId && !options.gstins.some((g) => g.id === entry.gstRegistrationId)
      ? db.gstRegistration.findUnique({ where: { id: entry.gstRegistrationId }, select: { id: true, gstin: true, stateCode: true } })
      : null,
  ]);
  if (category) options.categories.push(category);
  if (brand) options.brands.push({ ...brand, name: `${brand.name} (archived)` });
  if (plant) options.plants.push({ ...plant, name: `${plant.name} (archived)` });
  if (gst) options.gstins.push(gst);

  return (
    <div className="grid max-w-4xl gap-6">
      <PageHeader
        title="Edit material entry"
        description={entry.source === "IMPORT" ? "This entry was created by a file import." : "Changes are recorded in the audit log."}
      />
      <MaterialEntryForm
        orgSlug={orgSlug}
        entryId={entry.id}
        options={options}
        maxMonth={monthKey(startOfMonth(new Date()))}
        defaults={{
          month: monthKey(entry.periodMonth),
          categoryId: entry.categoryId,
          entityType: entry.entityType,
          stateCode: entry.stateCode,
          brandId: entry.brandId,
          plantId: entry.plantId,
          gstRegistrationId: entry.gstRegistrationId,
          quantityKg: entry.quantityKg.toString(),
          recycledContentKg: entry.recycledContentKg?.toString() ?? null,
          isPreConsumer: entry.isPreConsumer,
          notes: entry.notes,
        }}
      />
    </div>
  );
}
