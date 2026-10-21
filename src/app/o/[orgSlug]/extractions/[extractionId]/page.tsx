import { CircleAlertIcon, ExternalLinkIcon, InfoIcon, LoaderCircleIcon, SparklesIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CertificateForm } from "@/features/certificates/certificate-form";
import { loadCertificateOptions } from "@/features/certificates/queries";
import { AutoRefresh, ExtractionButtons, InvoiceReviewForm } from "@/features/extractions/components";
import { isStale } from "@/features/extractions/service";
import { ExtractionStatusBadge } from "@/features/extractions/status-badge";
import { loadMaterialContext } from "@/features/materials/queries";
import { certificateExtractionSchema, invoiceExtractionSchema } from "@/lib/ai/schemas";
import { getOrgContext } from "@/lib/auth/session";
import { dateKey, istToday } from "@/lib/domain/deadlines/schedule";
import { certificateDraft, invoiceDraft } from "@/lib/domain/extraction/map";

export const metadata: Metadata = { title: "Review document" };
export const maxDuration = 120;

export default async function ExtractionPage({ params }: PageProps<"/o/[orgSlug]/extractions/[extractionId]">) {
  const { orgSlug, extractionId } = await params;
  if (!/^[a-z0-9]{10,40}$/i.test(extractionId)) notFound();
  const ctx = await getOrgContext(orgSlug);
  const { db, org, can } = ctx;
  const e = await db.extraction.findUnique({ where: { id: extractionId }, include: { file: true } });
  if (!e) notFound();

  const now = new Date();
  const stale = isStale(e, now);
  const running = (e.status === "QUEUED" || e.status === "PROCESSING") && !stale;
  const reviewable = (e.status === "NEEDS_REVIEW" || e.status === "FAILED" || stale) && can("data.write");
  const fileUrl = `/o/${orgSlug}/files/${e.file.id}`;
  const today = dateKey(istToday(now));

  let review: React.ReactNode = null;
  let check: string[] = [];
  let notes: string[] = [];
  if (reviewable && e.target === "CERTIFICATE") {
    const options = await loadCertificateOptions(ctx);
    const categories = await db.materialCategory.findMany({ where: { active: true, stream: { in: org.wasteStreams } }, select: { id: true, code: true, name: true, stream: true } });
    const parsed = certificateExtractionSchema.safeParse(e.extracted);
    const draft = parsed.success
      ? certificateDraft(parsed.data, { categories, enabledStreams: org.wasteStreams, recyclers: options.recyclers.map((r) => ({ id: r.id, name: r.name, registrationNo: r.registrationNo })) })
      : null;
    check = draft?.check ?? [];
    notes = draft?.notes ?? [];
    review = <CertificateForm orgSlug={orgSlug} options={options} defaults={draft?.defaults ?? {}} today={today} extractionId={e.id} />;
  } else if (reviewable) {
    const mc = await loadMaterialContext(db, org);
    const parsed = invoiceExtractionSchema.safeParse(e.extracted);
    const draft = parsed.success ? invoiceDraft(parsed.data, { categories: mc.categories, enabledStreams: org.wasteStreams, gstins: mc.gstins }) : null;
    check = draft?.check ?? [];
    notes = [...(draft?.reference ? [draft.reference] : []), ...(draft?.notes ?? [])];
    review = (
      <InvoiceReviewForm
        orgSlug={orgSlug}
        extractionId={e.id}
        draft={draft ?? { month: null, stateCode: null, gstRegistrationId: null, rows: [] }}
        options={{ categories: mc.categories, entityTypes: org.entityTypes, gstins: mc.gstins, brands: mc.brands }}
        maxMonth={today.slice(0, 7)}
      />
    );
  }

  const [certificate, entryCount] = await Promise.all([
    e.status === "APPROVED" && e.target === "CERTIFICATE" ? db.certificate.findFirst({ where: { extractionId: e.id }, select: { id: true, certificateNumber: true } }) : null,
    e.status === "APPROVED" && e.target === "MATERIAL_ENTRY" ? db.materialEntry.count({ where: { extractionId: e.id, deletedAt: null } }) : 0,
  ]);

  return (
    <div className="grid gap-6">
      <AutoRefresh active={running} />
      <PageHeader
        title={e.file.fileName}
        description={`${e.target === "CERTIFICATE" ? "EPR certificate" : "Invoice"}${e.model ? ` · read by ${e.model}${e.inputTokens !== null ? ` · ${(e.inputTokens + (e.outputTokens ?? 0)).toLocaleString("en-IN")} tokens` : ""}` : ""}`}
        actions={<ExtractionStatusBadge status={stale ? "FAILED" : e.status} />}
      />

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Card className="xl:sticky xl:top-20">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Document</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLinkIcon /> Open in new tab
              </a>
            </Button>
          </CardHeader>
          <CardContent>
            {e.file.mimeType === "application/pdf" ? (
              <iframe src={fileUrl} title={`Preview of ${e.file.fileName}`} className="h-[70vh] w-full rounded-lg border bg-muted" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- authenticated, same-origin document; not a static asset
              <img src={fileUrl} alt={`Uploaded document ${e.file.fileName}`} className="max-h-[70vh] w-full rounded-lg border object-contain" />
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4">
          {running && (
            <Card>
              <CardContent className="flex items-center gap-3 py-6">
                <LoaderCircleIcon className="size-5 animate-spin text-primary motion-reduce:animate-none" aria-hidden />
                <div>
                  <p className="font-medium">Claude is reading the document…</p>
                  <p className="text-sm text-muted-foreground">This usually takes 10–40 seconds. The page updates by itself.</p>
                </div>
              </CardContent>
            </Card>
          )}

          {(e.status === "FAILED" || stale) && (
            <Alert className="border-status-serious/50">
              <CircleAlertIcon className="text-status-serious" />
              <AlertTitle>The document could not be read automatically</AlertTitle>
              <AlertDescription>{stale ? "Reading took too long and was stopped." : e.error}</AlertDescription>
            </Alert>
          )}

          {e.status === "NEEDS_REVIEW" && (check.length > 0 || notes.length > 0) && (
            <Alert className="border-status-warning/50">
              <SparklesIcon className="text-status-warning" />
              <AlertTitle>Check before saving</AlertTitle>
              <AlertDescription>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  {check.length > 0 && <li>Low confidence: {check.join(", ")}</li>}
                  {notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          {e.status === "NEEDS_REVIEW" && check.length === 0 && notes.length === 0 && (
            <Alert>
              <InfoIcon />
              <AlertTitle>All fields read with high confidence</AlertTitle>
              <AlertDescription>Still compare them with the document before saving.</AlertDescription>
            </Alert>
          )}

          {review}

          {e.status === "APPROVED" && (
            <Card>
              <CardContent className="py-6 text-sm">
                {certificate ? (
                  <>
                    Saved as certificate{" "}
                    <Link href={`/o/${orgSlug}/certificates/${certificate.id}`} className="font-mono font-medium underline-offset-4 hover:underline">
                      {certificate.certificateNumber}
                    </Link>
                    .
                  </>
                ) : (
                  <>
                    Imported as {entryCount} material entr{entryCount === 1 ? "y" : "ies"}.{" "}
                    <Link href={`/o/${orgSlug}/materials?source=AI_EXTRACTION`} className="font-medium underline-offset-4 hover:underline">
                      View them
                    </Link>
                  </>
                )}
              </CardContent>
            </Card>
          )}
          {e.status === "REJECTED" && <p className="text-sm text-muted-foreground">This document was discarded.</p>}

          {can("data.write") && e.status !== "APPROVED" && e.status !== "REJECTED" && (
            <ExtractionButtons orgSlug={orgSlug} id={e.id} canRetry={e.status === "FAILED" || stale} canDiscard />
          )}
        </div>
      </div>
    </div>
  );
}
