import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { getOrgContext } from "@/lib/auth/session";
import { updateOrganizationAction } from "@/features/organization/actions";
import { OrganizationSettingsForm } from "./organization-form";

export const metadata: Metadata = { title: "Organization settings" };

export default async function OrganizationSettingsPage({ params }: PageProps<"/o/[orgSlug]/settings">) {
  const { orgSlug } = await params;
  const { org, can } = await getOrgContext(orgSlug);

  return (
    <div className="grid max-w-3xl gap-6">
      <PageHeader title="Organization" description="Company details used across reports and CPCB exports." />
      <OrganizationSettingsForm
        action={updateOrganizationAction.bind(null, orgSlug)}
        canEdit={can("org.manage")}
        defaults={{
          name: org.name,
          legalName: org.legalName,
          entityTypes: org.entityTypes,
          wasteStreams: org.wasteStreams,
          headOfficeState: org.headOfficeState,
          cpcbRegistrationNo: org.cpcbRegistrationNo,
          pan: org.pan,
          cin: org.cin,
          registeredAddress: org.registeredAddress,
        }}
      />
    </div>
  );
}
