import { CheckCircle2Icon, CircleAlertIcon, DownloadIcon, FileSpreadsheetIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BatchActions } from "@/features/materials/import-controls";
import type { StoredErrors } from "@/features/materials/import-actions";
import { getOrgContext } from "@/lib/auth/session";
import { formatMonth } from "@/lib/domain/financial-year";
import type { NormalisedRow } from "@/lib/domain/materials/import";
import { stateName } from "@/lib/domain/states";
import { formatTonnes } from "@/lib/domain/units";

export const metadata: Metadata = { title: "Review import" };

const COLUMN_LABELS: Record<string, string> = {
  month: "Month",
  category: "Category",
  entity_type: "Entity type",
  state: "State",
  quantity: "Quantity",
  unit: "Unit",
  brand: "Brand",
  plant: "Plant",
  gstin: "GSTIN",
  recycled_content: "Recycled content",
  pre_consumer: "Pre-consumer",
};
const ERROR_LIMIT = 200;
const PREVIEW_LIMIT = 20;

export default async function ImportBatchPage({ params }: PageProps<"/o/[orgSlug]/materials/import/[batchId]">) {
  const { orgSlug, batchId } = await params;
  const { db, can, org } = await getOrgContext(orgSlug);
  const batch = await db.importBatch.findUnique({ where: { id: batchId } });
  if (!batch) notFound();

  const errors = (batch.errors ?? { items: [] }) as StoredErrors;
  const rows = ((batch.rows ?? []) as { row: number; data: NormalisedRow }[]).slice(0, PREVIEW_LIMIT);
  const categories = await db.materialCategory.findMany({ where: { stream: { in: org.wasteStreams } }, select: { id: true, name: true } });
  const categoryName = new Map(categories.map((c) => [c.id, c.name.split(" – ")[0]]));
  const totalKg = ((batch.rows ?? []) as { data: NormalisedRow }[]).reduce((s, r) => s + Number(r.data.quantityKg), 0);
  const reviewable = batch.status === "VALIDATED" && can("data.write");

  return (
    <div className="grid max-w-6xl gap-6">
      <PageHeader
        title="Review import"
        description={batch.fileName}
        actions={reviewable && <BatchActions orgSlug={orgSlug} batchId={batch.id} validRows={batch.validRows} />}
      />

      {batch.status === "COMMITTED" && (
        <Alert className="border-success/40">
          <CheckCircle2Icon className="text-success" />
          <AlertTitle>Imported</AlertTitle>
          <AlertDescription>
            {batch.validRows} rows were added.{" "}
            <Link href={`/o/${orgSlug}/materials?source=IMPORT`} className="underline underline-offset-4">
              View imported entries
            </Link>
          </AlertDescription>
        </Alert>
      )}
      {batch.status === "FAILED" && (
        <Alert>
          <CircleAlertIcon />
          <AlertTitle>Discarded</AlertTitle>
          <AlertDescription>Nothing from this file was saved.</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat icon={<FileSpreadsheetIcon />} label="Rows in file" value={batch.totalRows} />
        <Stat icon={<CheckCircle2Icon />} label="Ready to import" value={batch.validRows} hint={batch.validRows ? formatTonnes(totalKg) : undefined} tone="success" />
        <Stat icon={<CircleAlertIcon />} label="Rows with errors" value={batch.errorRows} tone={batch.errorRows ? "destructive" : undefined} />
      </div>

      {errors.items.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div className="grid gap-1.5">
              <CardTitle>Problems found</CardTitle>
              <CardDescription>
                These rows will be skipped. Download them with an &quot;errors&quot; column, fix them, and upload again.
              </CardDescription>
            </div>
            <Button asChild variant="outline" size="sm">
              <a href={`/o/${orgSlug}/materials/import/${batch.id}/errors`} download>
                <DownloadIcon /> Download error rows
              </a>
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Row</TableHead>
                  <TableHead className="w-40">Column</TableHead>
                  <TableHead className="w-48">Value</TableHead>
                  <TableHead>Problem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {errors.items.slice(0, ERROR_LIMIT).map((e, i) => (
                  <TableRow key={`${e.row}-${e.column}-${i}`}>
                    <TableCell className="tabular-nums">{e.row}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{COLUMN_LABELS[e.column] ?? e.column}</Badge>
                    </TableCell>
                    <TableCell className="max-w-48 truncate font-mono text-xs" title={e.value}>
                      {e.value ?? <span className="text-muted-foreground">(empty)</span>}
                    </TableCell>
                    <TableCell className="text-destructive">{e.message}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {errors.items.length > ERROR_LIMIT && (
              <p className="mt-3 text-sm text-muted-foreground">
                Showing the first {ERROR_LIMIT} of {errors.items.length} problems — download the error rows to see them all.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {rows.length > 0 && batch.status === "VALIDATED" && (
        <Card>
          <CardHeader>
            <CardTitle>Preview of valid rows</CardTitle>
            <CardDescription>
              {batch.validRows > PREVIEW_LIMIT ? `First ${PREVIEW_LIMIT} of ${batch.validRows} rows.` : `${batch.validRows} rows.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Row</TableHead>
                  <TableHead>Month</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ row, data }) => (
                  <TableRow key={row}>
                    <TableCell className="tabular-nums text-muted-foreground">{row}</TableCell>
                    <TableCell>{formatMonth(new Date(`${data.periodMonth}T00:00:00Z`))}</TableCell>
                    <TableCell>{categoryName.get(data.categoryId)}</TableCell>
                    <TableCell>{stateName(data.stateCode)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatTonnes(data.quantityKg)}</TableCell>
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

function Stat({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  hint?: string;
  tone?: "success" | "destructive";
}) {
  const color = tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : "text-primary";
  return (
    <Card className="gap-2">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardDescription>{label}</CardDescription>
        <span className={`${color} [&_svg]:size-5`}>{icon}</span>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold tabular-nums">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
