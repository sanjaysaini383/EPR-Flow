import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { CertificateForm } from "@/features/certificates/certificate-form";
import { loadCertificateOptions } from "@/features/certificates/queries";
import { getOrgContext } from "@/lib/auth/session";
import { dateKey, istToday } from "@/lib/domain/deadlines/schedule";

export const metadata: Metadata = { title: "Add certificate" };

export default async function NewCertificatePage({ params }: PageProps<"/o/[orgSlug]/certificates/new">) {
  const { orgSlug } = await params;
  const ctx = await getOrgContext(orgSlug);
  if (!ctx.can("certificates.write")) notFound();
  const options = await loadCertificateOptions(ctx);

  return (
    <div className="grid max-w-4xl gap-6">
      <PageHeader title="Add certificate" description="Enter the details exactly as on the certificate. Save a draft, or submit it for an Admin to approve." />
      <CertificateForm orgSlug={orgSlug} options={options} defaults={{}} today={dateKey(istToday(new Date()))} />
    </div>
  );
}
