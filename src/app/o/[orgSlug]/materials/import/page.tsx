import { DownloadIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UploadForm } from "@/features/materials/import-controls";
import { getOrgContext } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Import materials" };

const timeFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
const STATUS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  VALIDATED: { label: "Awaiting review", variant: "outline" },
  COMMITTED: { label: "Imported", variant: "default" },
  FAILED: { label: "Discarded", variant: "secondary" },
  UPLOADED: { label: "Uploaded", variant: "outline" },
};

export default async function ImportPage({ params }: PageProps<"/o/[orgSlug]/materials/import">) {
  const { orgSlug } = await params;
  const { db, can } = await getOrgContext(orgSlug);
  if (!can("data.write")) redirect(`/o/${orgSlug}/materials`);

  const batches = await db.importBatch.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, fileName: true, status: true, totalRows: true, validRows: true, errorRows: true, createdAt: true },
  });

  return (
    <div className="grid max-w-5xl gap-6">
      <PageHeader
        title="Import materials"
        description="Upload a spreadsheet of monthly quantities. You'll see every problem before anything is saved."
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Upload a file</CardTitle>
            <CardDescription>Rows with errors are skipped — you can download them, fix them and upload again.</CardDescription>
          </CardHeader>
          <CardContent>
            <UploadForm orgSlug={orgSlug} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Start from the template</CardTitle>
            <CardDescription>Pre-filled with your brands, plants and GSTINs as examples.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Button asChild variant="outline" className="justify-start">
              <a href={`/o/${orgSlug}/materials/import/template?format=xlsx`} download>
                <DownloadIcon /> Excel template (.xlsx)
              </a>
            </Button>
            <Button asChild variant="outline" className="justify-start">
              <a href={`/o/${orgSlug}/materials/import/template?format=csv`} download>
                <DownloadIcon /> CSV template
              </a>
            </Button>
            <ul className="mt-2 grid gap-1.5 text-sm text-muted-foreground">
              <li>
                <span className="font-medium text-foreground">Required:</span> month, category, quantity, and state (or a GSTIN / plant)
              </li>
              <li>
                <span className="font-medium text-foreground">Months:</span> 2025-07, Jul 2025 or a date
              </li>
              <li>
                <span className="font-medium text-foreground">Categories:</span> Cat I, Cat II, Cat III, Cat IV
              </li>
              <li>
                <span className="font-medium text-foreground">Units:</span> kg (default) or tonne
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>

      {batches.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent imports</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Uploaded (IST)</TableHead>
                  <TableHead className="text-right">Rows</TableHead>
                  <TableHead className="text-right">Valid</TableHead>
                  <TableHead className="text-right">With errors</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>
                      <Link href={`/o/${orgSlug}/materials/import/${b.id}`} className="font-medium underline-offset-4 hover:underline">
                        {b.fileName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{timeFormat.format(b.createdAt)}</TableCell>
                    <TableCell className="text-right tabular-nums">{b.totalRows}</TableCell>
                    <TableCell className="text-right tabular-nums">{b.validRows}</TableCell>
                    <TableCell className="text-right tabular-nums">{b.errorRows}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS[b.status].variant}>{STATUS[b.status].label}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
