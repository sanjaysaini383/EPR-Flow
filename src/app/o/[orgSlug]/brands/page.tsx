import { TagIcon } from "lucide-react";
import type { Metadata } from "next";
import { ArchiveButton } from "@/components/app/archive-button";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BrandDialog } from "@/features/structure/dialogs";
import { getOrgContext } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Brands" };

export default async function BrandsPage({ params }: PageProps<"/o/[orgSlug]/brands">) {
  const { orgSlug } = await params;
  const { db, can } = await getOrgContext(orgSlug);
  const canEdit = can("data.write");

  const brands = await db.brand.findMany({
    orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { name: "asc" }],
    include: { _count: { select: { materialEntries: { where: { deletedAt: null } } } } },
  });

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Brands"
        description="Brands you sell under. Material data and reports can be split by brand."
        actions={canEdit && <BrandDialog orgSlug={orgSlug} />}
      />
      {brands.length === 0 ? (
        <EmptyState
          icon={<TagIcon />}
          title="No brands yet"
          description="Add the brands you sell under to split material data and reports."
          action={canEdit && <BrandDialog orgSlug={orgSlug} />}
        />
      ) : (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Brand</TableHead>
                  <TableHead className="text-right">Material entries</TableHead>
                  <TableHead>Status</TableHead>
                  {canEdit && <TableHead className="w-48" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {brands.map((b) => (
                  <TableRow key={b.id} className={b.archivedAt ? "text-muted-foreground" : undefined}>
                    <TableCell>
                      <div className="font-medium">{b.name}</div>
                      {b.description && <div className="text-xs text-muted-foreground">{b.description}</div>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{b._count.materialEntries}</TableCell>
                    <TableCell>{b.archivedAt ? <Badge variant="outline">Archived</Badge> : <Badge variant="secondary">Active</Badge>}</TableCell>
                    {canEdit && (
                      <TableCell className="text-right">
                        {!b.archivedAt && <BrandDialog orgSlug={orgSlug} brand={b} />}
                        <ArchiveButton orgSlug={orgSlug} kind="brand" id={b.id} archived={!!b.archivedAt} name={b.name} />
                      </TableCell>
                    )}
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
