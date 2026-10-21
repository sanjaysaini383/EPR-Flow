import { CircleAlertIcon, ScanTextIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AutoRefresh, UploadExtractionForm } from "@/features/extractions/components";
import { isStale } from "@/features/extractions/service";
import { ExtractionStatusBadge } from "@/features/extractions/status-badge";
import { getExtractionProvider } from "@/lib/ai/extract";
import { getOrgContext } from "@/lib/auth/session";

export const metadata: Metadata = { title: "AI extraction" };
// Uploads run Claude in the background after responding; give the function time to finish.
export const maxDuration = 120;

const timeFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

export default async function ExtractionsPage({ params }: PageProps<"/o/[orgSlug]/extractions">) {
  const { orgSlug } = await params;
  const { db, can } = await getOrgContext(orgSlug);
  const extractions = await db.extraction.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { file: { select: { fileName: true } } },
  });
  const people = await db.membership.findMany({
    where: { userId: { in: [...new Set(extractions.map((e) => e.createdById))] } },
    select: { userId: true, user: { select: { name: true, email: true } } },
  });
  const configured = getExtractionProvider() !== null;
  const now = new Date();
  const running = extractions.some((e) => (e.status === "QUEUED" || e.status === "PROCESSING") && !isStale(e, now));

  return (
    <div className="grid gap-6">
      <AutoRefresh active={running} />
      <PageHeader
        title="AI extraction"
        description="Upload an EPR certificate or an invoice. Claude reads it, you check every value side by side with the document, and nothing is saved until you approve it."
      />

      {!configured && (
        <Alert className="border-status-warning/50">
          <CircleAlertIcon className="text-status-warning" />
          <AlertTitle>AI is not set up on this server</AlertTitle>
          <AlertDescription>Set ANTHROPIC_API_KEY (and optionally ANTHROPIC_MODEL) to read documents automatically. Uploads still work — you enter the values by hand next to the document.</AlertDescription>
        </Alert>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        {can("data.write") && (
          <Card>
            <CardHeader>
              <CardTitle>Upload a document</CardTitle>
              <CardDescription>Values the AI is unsure about are highlighted for you to check.</CardDescription>
            </CardHeader>
            <CardContent>
              <UploadExtractionForm orgSlug={orgSlug} />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Recent documents</CardTitle>
          </CardHeader>
          <CardContent>
            {extractions.length === 0 ? (
              <EmptyState icon={<ScanTextIcon />} title="No documents yet" description="Upload a certificate PDF or a photo of an invoice to try it." className="py-10" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Document</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {extractions.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="max-w-64">
                        <Link href={`/o/${orgSlug}/extractions/${e.id}`} className="block truncate font-medium underline-offset-4 hover:underline">
                          {e.file.fileName}
                        </Link>
                      </TableCell>
                      <TableCell>{e.target === "CERTIFICATE" ? "Certificate" : "Invoice"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        <div className="tabular-nums">{timeFormat.format(e.createdAt)}</div>
                        <div className="text-xs">{people.find((p) => p.userId === e.createdById)?.user.name ?? "Former member"}</div>
                      </TableCell>
                      <TableCell>
                        <ExtractionStatusBadge status={isStale(e, now) ? "FAILED" : e.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
