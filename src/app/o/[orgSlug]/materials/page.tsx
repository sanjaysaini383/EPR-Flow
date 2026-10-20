import { FileUpIcon, PackageIcon, PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EntryActions, MaterialFilters } from "@/features/materials/list-controls";
import { getOrgContext } from "@/lib/auth/session";
import { financialYearOf, formatMonth, isFinancialYear, recentFinancialYears } from "@/lib/domain/financial-year";
import { INDIAN_STATES, stateName } from "@/lib/domain/states";
import { formatKg, formatTonnes } from "@/lib/domain/units";

export const metadata: Metadata = { title: "Materials" };

const PAGE_SIZE = 50;
const ENTITY_LABELS: Record<string, string> = { PRODUCER: "Producer", IMPORTER: "Importer", BRAND_OWNER: "Brand Owner" };

function one(v: string | string[] | undefined) {
  return typeof v === "string" ? v : undefined;
}

export default async function MaterialsPage({ params, searchParams }: PageProps<"/o/[orgSlug]/materials">) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const { db, org, can } = await getOrgContext(orgSlug);
  const canEdit = can("data.write");

  // Years: recent ones plus any year that has data; default to the latest year with data.
  const yearsWithData = await db.materialEntry.groupBy({ by: ["financialYear"], where: { deletedAt: null } });
  const dataYears = yearsWithData.map((y) => y.financialYear);
  const years = [...new Set([...recentFinancialYears(new Date(), 3), ...dataYears])].sort().reverse();
  const requestedFy = one(sp.fy);
  const fy = requestedFy && isFinancialYear(requestedFy) ? requestedFy : (dataYears.sort().reverse()[0] ?? financialYearOf(new Date()));

  const page = Math.max(1, Number(one(sp.page)) || 1);
  const filters = {
    deletedAt: null,
    financialYear: fy,
    ...(one(sp.category) ? { categoryId: one(sp.category) } : {}),
    ...(one(sp.state) ? { stateCode: one(sp.state) } : {}),
    ...(one(sp.brand) ? { brandId: one(sp.brand) } : {}),
    ...(one(sp.source) === "MANUAL" || one(sp.source) === "IMPORT" ? { source: one(sp.source) as "MANUAL" | "IMPORT" } : {}),
  };

  const [entries, total, byCategory, categories, brands, totalAll] = await Promise.all([
    db.materialEntry.findMany({
      where: filters,
      orderBy: [{ periodMonth: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        category: { select: { name: true, code: true } },
        brand: { select: { name: true } },
        plant: { select: { name: true } },
      },
    }),
    db.materialEntry.count({ where: filters }),
    db.materialEntry.groupBy({ by: ["categoryId"], where: filters, _sum: { quantityKg: true }, _count: true }),
    db.materialCategory.findMany({ where: { stream: { in: org.wasteStreams } }, orderBy: { sortOrder: "asc" } }),
    db.brand.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.materialEntry.aggregate({ where: filters, _sum: { quantityKg: true } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const hasAnyData = dataYears.length > 0;

  const query = (p: number) => {
    const next = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]);
    next.set("page", String(p));
    return `?${next.toString()}`;
  };

  const actions = canEdit && (
    <>
      <Button asChild variant="outline">
        <Link href={`/o/${orgSlug}/materials/import`}>
          <FileUpIcon /> Import CSV / Excel
        </Link>
      </Button>
      <Button asChild>
        <Link href={`/o/${orgSlug}/materials/new`}>
          <PlusIcon /> Add entry
        </Link>
      </Button>
    </>
  );

  if (!hasAnyData) {
    return (
      <div className="grid gap-6">
        <PageHeader title="Materials" description="Quantity of packaging and products placed on the market each month." actions={actions} />
        <EmptyState
          icon={<PackageIcon />}
          title="No material data yet"
          description="Add monthly quantities by category and state — one at a time, or upload a CSV/Excel file with many rows at once."
          action={actions && <div className="flex gap-2">{actions}</div>}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <PageHeader title="Materials" description="Quantity of packaging and products placed on the market each month." actions={actions} />

      <MaterialFilters
        years={years}
        categories={categories.map((c) => ({ value: c.id, label: c.name.split(" – ")[0] }))}
        states={INDIAN_STATES.map((s) => ({ value: s.code, label: s.name }))}
        brands={brands.map((b) => ({ value: b.id, label: b.name }))}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="gap-2 bg-brand-soft/40">
          <CardHeader>
            <CardDescription>Total · FY {fy}</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{formatTonnes(totalAll._sum.quantityKg?.toString() ?? 0)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">{total} entr{total === 1 ? "y" : "ies"}</CardContent>
        </Card>
        {byCategory
          .sort((a, b) => Number(b._sum.quantityKg ?? 0) - Number(a._sum.quantityKg ?? 0))
          .slice(0, 3)
          .map((c) => (
            <Card key={c.categoryId} className="gap-2">
              <CardHeader>
                <CardDescription className="truncate">{categoryName.get(c.categoryId) ?? "Category"}</CardDescription>
                <CardTitle className="text-2xl tabular-nums">{formatTonnes(c._sum.quantityKg?.toString() ?? 0)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">{c._count} entr{c._count === 1 ? "y" : "ies"}</CardContent>
            </Card>
          ))}
      </div>

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Brand / plant</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead>Source</TableHead>
                {canEdit && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    No entries match these filters.
                  </TableCell>
                </TableRow>
              )}
              {entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap">{formatMonth(e.periodMonth)}</TableCell>
                  <TableCell>
                    <div className="max-w-56 truncate" title={e.category.name}>
                      {e.category.name.split(" – ")[0]}
                    </div>
                    {e.isPreConsumer && <div className="text-xs text-muted-foreground">Pre-consumer</div>}
                  </TableCell>
                  <TableCell>{ENTITY_LABELS[e.entityType]}</TableCell>
                  <TableCell>{stateName(e.stateCode)}</TableCell>
                  <TableCell>
                    <div>{e.brand?.name ?? "—"}</div>
                    {e.plant && <div className="text-xs text-muted-foreground">{e.plant.name}</div>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <div className="font-medium">{formatTonnes(e.quantityKg.toString())}</div>
                    <div className="text-xs text-muted-foreground">{formatKg(e.quantityKg.toString())}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={e.source === "IMPORT" ? "outline" : "secondary"}>{e.source === "IMPORT" ? "Import" : "Manual"}</Badge>
                  </TableCell>
                  {canEdit && (
                    <TableCell>
                      <EntryActions orgSlug={orgSlug} id={e.id} />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
            {entries.length > 0 && (
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={5}>Total ({total} entries)</TableCell>
                  <TableCell className="text-right tabular-nums">{formatTonnes(totalAll._sum.quantityKg?.toString() ?? 0)}</TableCell>
                  <TableCell colSpan={canEdit ? 2 : 1} />
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </CardContent>
      </Card>

      {pages > 1 && (
        <nav className="flex items-center justify-end gap-2 text-sm" aria-label="Pagination">
          <span className="text-muted-foreground">
            Page {page} of {pages}
          </span>
          <Button asChild variant="outline" size="sm" aria-disabled={page <= 1} className={page <= 1 ? "pointer-events-none opacity-50" : ""}>
            <Link href={query(page - 1)}>Previous</Link>
          </Button>
          <Button asChild variant="outline" size="sm" aria-disabled={page >= pages} className={page >= pages ? "pointer-events-none opacity-50" : ""}>
            <Link href={query(page + 1)}>Next</Link>
          </Button>
        </nav>
      )}
    </div>
  );
}
