import { RecycleIcon, SearchIcon, StarIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AddRecyclerDialog } from "@/features/recyclers/components";
import { VerificationBadge } from "@/features/recyclers/verification-badge";
import { getOrgContext } from "@/lib/auth/session";
import { financialYearOf } from "@/lib/domain/financial-year";
import { stateName } from "@/lib/domain/states";
import { formatTonnes } from "@/lib/domain/units";
import { recyclerPlatformStats } from "@/lib/fraud/recycler-stats";

export const metadata: Metadata = { title: "Recyclers" };

export default async function RecyclersPage({ params, searchParams }: PageProps<"/o/[orgSlug]/recyclers">) {
  const { orgSlug } = await params;
  const { q: rawQ } = await searchParams;
  const { db, can } = await getOrgContext(orgSlug);
  const q = typeof rawQ === "string" ? rawQ.trim().slice(0, 80) : "";
  const fy = financialYearOf(new Date());

  const recyclers = await db.recycler.findMany({
    where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { cpcbRegistrationNo: { contains: q, mode: "insensitive" } }, { city: { contains: q, mode: "insensitive" } }] } : {},
    include: { capacities: { where: { financialYear: fy }, include: { category: { select: { name: true, sortOrder: true } } } } },
    orderBy: [{ verificationStatus: "asc" }, { name: "asc" }],
    take: 200,
  });
  const ids = recyclers.map((r) => r.id);
  const [mine, stats] = await Promise.all([
    db.certificate.groupBy({ by: ["recyclerId"], where: { recyclerId: { in: ids }, deletedAt: null, status: "APPROVED" }, _sum: { quantityKg: true }, _count: true }),
    recyclerPlatformStats(ids, fy),
  ]);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Recycler directory"
        description="Registered plastic waste processors on EPRFlow, with capacity, ratings and your purchase history. Platform entries are checked against the CPCB register."
        actions={can("certificates.write") && <AddRecyclerDialog orgSlug={orgSlug} />}
      />

      <form className="relative max-w-sm" role="search">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input name="q" defaultValue={q} placeholder="Search by name, registration no. or city" aria-label="Search recyclers" className="pl-9" />
      </form>

      {recyclers.length === 0 ? (
        <EmptyState icon={<RecycleIcon />} title={q ? "No recyclers match your search" : "No recyclers yet"} description="Add a recycler you buy certificates from, or ask EPRFlow to list them." />
      ) : (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recycler</TableHead>
                  <TableHead>Registration</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Categories (FY {fy})</TableHead>
                  <TableHead className="text-right">Rating</TableHead>
                  <TableHead className="text-right">Bought by you</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recyclers.map((r) => {
                  const s = stats.get(r.id);
                  const m = mine.find((x) => x.recyclerId === r.id);
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Link href={`/o/${orgSlug}/recyclers/${r.id}`} className="font-medium underline-offset-4 hover:underline">
                          {r.name}
                        </Link>
                        {r.organizationId && <div className="text-xs text-muted-foreground">Added by your team</div>}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.cpcbRegistrationNo ?? "—"}</TableCell>
                      <TableCell>{[r.city, stateName(r.stateCode)].filter(Boolean).join(", ")}</TableCell>
                      <TableCell>
                        <VerificationBadge status={r.verificationStatus} />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {r.capacities.length === 0 && <span className="text-xs text-muted-foreground">Not on record</span>}
                          {r.capacities
                            .sort((a, b) => a.category.sortOrder - b.category.sortOrder)
                            .map((c) => (
                              <Badge key={c.id} variant="secondary">
                                {c.category.name.split(" – ")[0].replace("Category ", "Cat ")}
                              </Badge>
                            ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s?.ratingAvg ? (
                          <span className="inline-flex items-center gap-1">
                            <StarIcon className="size-3.5 fill-status-warning text-status-warning" aria-hidden />
                            {s.ratingAvg.toFixed(1)} <span className="text-xs text-muted-foreground">({s.ratingCount})</span>
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">No ratings</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{m ? `${formatTonnes(m._sum.quantityKg?.toString() ?? 0)} · ${m._count}` : "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
