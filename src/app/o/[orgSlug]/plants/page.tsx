import { FactoryIcon } from "lucide-react";
import type { Metadata } from "next";
import { ArchiveButton } from "@/components/app/archive-button";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlantDialog } from "@/features/structure/dialogs";
import { getOrgContext } from "@/lib/auth/session";
import { stateName } from "@/lib/domain/states";

export const metadata: Metadata = { title: "Plants" };

export default async function PlantsPage({ params }: PageProps<"/o/[orgSlug]/plants">) {
  const { orgSlug } = await params;
  const { db, can } = await getOrgContext(orgSlug);
  const canEdit = can("data.write");

  const [plants, gstins] = await Promise.all([
    db.plant.findMany({
      orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { name: "asc" }],
      include: {
        gstRegistration: { select: { gstin: true } },
        _count: { select: { materialEntries: { where: { deletedAt: null } } } },
      },
    }),
    db.gstRegistration.findMany({
      where: { archivedAt: null },
      select: { id: true, gstin: true, stateCode: true },
      orderBy: { stateCode: "asc" },
    }),
  ]);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Plants"
        description="Manufacturing units, warehouses and distribution centres."
        actions={canEdit && <PlantDialog orgSlug={orgSlug} gstins={gstins} />}
      />
      {plants.length === 0 ? (
        <EmptyState
          icon={<FactoryIcon />}
          title="No plants yet"
          description="Add your plants to attribute material data to the right location and GSTIN."
          action={canEdit && <PlantDialog orgSlug={orgSlug} gstins={gstins} />}
        />
      ) : (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plant</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>GSTIN</TableHead>
                  <TableHead className="text-right">Entries</TableHead>
                  {canEdit && <TableHead className="w-48" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {plants.map((p) => (
                  <TableRow key={p.id} className={p.archivedAt ? "text-muted-foreground" : undefined}>
                    <TableCell className="font-medium">
                      {p.name} {p.archivedAt && <Badge variant="outline">Archived</Badge>}
                    </TableCell>
                    <TableCell>
                      <div>{[p.city, stateName(p.stateCode)].filter(Boolean).join(", ")}</div>
                      {p.pincode && <div className="text-xs text-muted-foreground">PIN {p.pincode}</div>}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{p.gstRegistration?.gstin ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{p._count.materialEntries}</TableCell>
                    {canEdit && (
                      <TableCell className="text-right">
                        {!p.archivedAt && <PlantDialog orgSlug={orgSlug} plant={p} gstins={gstins} />}
                        <ArchiveButton orgSlug={orgSlug} kind="plant" id={p.id} archived={!!p.archivedAt} name={p.name} />
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
