import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { MaterialEntryForm } from "@/features/materials/entry-form";
import { loadMaterialContext } from "@/features/materials/queries";
import { getOrgContext } from "@/lib/auth/session";
import { monthKey, startOfMonth } from "@/lib/domain/financial-year";

export const metadata: Metadata = { title: "Add material entry" };

export default async function NewMaterialEntryPage({ params }: PageProps<"/o/[orgSlug]/materials/new">) {
  const { orgSlug } = await params;
  const { db, org, can } = await getOrgContext(orgSlug);
  if (!can("data.write")) redirect(`/o/${orgSlug}/materials`);

  const options = await loadMaterialContext(db, org);
  const thisMonth = monthKey(startOfMonth(new Date()));

  return (
    <div className="grid max-w-4xl gap-6">
      <PageHeader title="Add material entry" description="Quantity placed on the market for one month, category and state." />
      <MaterialEntryForm
        orgSlug={orgSlug}
        options={options}
        maxMonth={thisMonth}
        defaults={{ month: thisMonth, stateCode: options.gstins.length === 1 ? options.gstins[0].stateCode : org.headOfficeState ?? undefined }}
      />
    </div>
  );
}
