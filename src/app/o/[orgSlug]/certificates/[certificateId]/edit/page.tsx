import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { CertificateForm } from "@/features/certificates/certificate-form";
import { loadCertificateOptions } from "@/features/certificates/queries";
import { getOrgContext } from "@/lib/auth/session";
import { dateKey, istToday } from "@/lib/domain/deadlines/schedule";

export const metadata: Metadata = { title: "Edit certificate" };

export default async function EditCertificatePage({ params }: PageProps<"/o/[orgSlug]/certificates/[certificateId]/edit">) {
  const { orgSlug, certificateId } = await params;
  const ctx = await getOrgContext(orgSlug);
  if (!ctx.can("certificates.write") || !/^[a-z0-9]{10,40}$/i.test(certificateId)) notFound();
  const cert = await ctx.db.certificate.findUnique({ where: { id: certificateId }, include: { file: { select: { fileName: true } } } });
  if (!cert || cert.deletedAt) notFound();
  if (cert.status !== "DRAFT" && cert.status !== "REJECTED") redirect(`/o/${orgSlug}/certificates/${cert.id}`);
  const options = await loadCertificateOptions(ctx);

  return (
    <div className="grid max-w-4xl gap-6">
      <PageHeader title={`Edit ${cert.certificateNumber}`} description="Changes are re-checked against the directory and other certificates when you save." />
      <CertificateForm
        orgSlug={orgSlug}
        certificateId={cert.id}
        options={options}
        today={dateKey(istToday(new Date()))}
        defaults={{
          certificateNumber: cert.certificateNumber,
          recyclerId: cert.recyclerId,
          categoryId: cert.categoryId,
          type: cert.type,
          financialYear: cert.financialYear,
          stateCode: cert.stateCode,
          quantity: String(Number(cert.quantityKg)),
          issueDate: dateKey(cert.issueDate),
          transferDate: cert.transferDate ? dateKey(cert.transferDate) : null,
          cost: cert.costInr ? String(Number(cert.costInr)) : null,
          notes: cert.notes,
          fileName: cert.file?.fileName ?? null,
        }}
      />
    </div>
  );
}
