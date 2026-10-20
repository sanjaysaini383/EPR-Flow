import { ReceiptIndianRupeeIcon } from "lucide-react";
import type { Metadata } from "next";
import { ArchiveButton } from "@/components/app/archive-button";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GstDialog } from "@/features/structure/dialogs";
import { getOrgContext } from "@/lib/auth/session";
import { stateName } from "@/lib/domain/states";

export const metadata: Metadata = { title: "GST registrations" };

export default async function GstPage({ params }: PageProps<"/o/[orgSlug]/gst">) {
  const { orgSlug } = await params;
  const { db, can } = await getOrgContext(orgSlug);
  const canEdit = can("data.write");

  const registrations = await db.gstRegistration.findMany({
    orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { stateCode: "asc" }],
    include: { _count: { select: { plants: true, materialEntries: { where: { deletedAt: null } } } } },
  });
  const states = new Set(registrations.filter((r) => !r.archivedAt).map((r) => r.stateCode));

  return (
    <div className="grid gap-6">
      <PageHeader
        title="GST registrations"
        description={`Each GSTIN you invoice from${states.size ? ` — active in ${states.size} state${states.size === 1 ? "" : "s"}` : ""}.`}
        actions={canEdit && <GstDialog orgSlug={orgSlug} />}
      />
      {registrations.length === 0 ? (
        <EmptyState
          icon={<ReceiptIndianRupeeIcon />}
          title="No GST registrations yet"
          description="Add each GSTIN you invoice from. The state is detected from the GSTIN automatically."
          action={canEdit && <GstDialog orgSlug={orgSlug} />}
        />
      ) : (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>GSTIN</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Legal / trade name</TableHead>
                  <TableHead className="text-right">Plants</TableHead>
                  <TableHead className="text-right">Entries</TableHead>
                  {canEdit && <TableHead className="w-48" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {registrations.map((r) => (
                  <TableRow key={r.id} className={r.archivedAt ? "text-muted-foreground" : undefined}>
                    <TableCell className="font-mono">
                      {r.gstin} {r.archivedAt && <Badge variant="outline">Archived</Badge>}
                    </TableCell>
                    <TableCell>{stateName(r.stateCode)}</TableCell>
                    <TableCell>
                      <div>{r.legalName ?? "—"}</div>
                      {r.tradeName && <div className="text-xs text-muted-foreground">{r.tradeName}</div>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r._count.plants}</TableCell>
                    <TableCell className="text-right tabular-nums">{r._count.materialEntries}</TableCell>
                    {canEdit && (
                      <TableCell className="text-right">
                        {!r.archivedAt && <GstDialog orgSlug={orgSlug} registration={r} />}
                        <ArchiveButton orgSlug={orgSlug} kind="gst" id={r.id} archived={!!r.archivedAt} name={r.gstin} />
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
