import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { planName } from "@/lib/pricing";
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
      <Card className="gap-0 py-4">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="flex items-center gap-2">
            Plan <Badge variant="secondary">{planName(org.plan)}</Badge>
          </span>
          <Link href="/pricing" className="text-primary underline-offset-4 hover:underline">
            Compare plans
          </Link>
        </CardContent>
      </Card>
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
