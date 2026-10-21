import { StarIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CertificateStatusBadge } from "@/features/certificates/status-badge";
import { RatingForm } from "@/features/recyclers/components";
import { VerificationBadge } from "@/features/recyclers/verification-badge";
import { getOrgContext } from "@/lib/auth/session";
import { financialYearOf } from "@/lib/domain/financial-year";
import { stateName } from "@/lib/domain/states";
import { formatTonnes } from "@/lib/domain/units";
import { recyclerCapacityUse, recyclerPlatformStats } from "@/lib/fraud/recycler-stats";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Recycler" };

const dateFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default async function RecyclerPage({ params }: PageProps<"/o/[orgSlug]/recyclers/[recyclerId]">) {
  const { orgSlug, recyclerId } = await params;
  if (!/^[a-z0-9]{10,40}$/i.test(recyclerId)) notFound();
  const { db, user, can } = await getOrgContext(orgSlug);
  const recycler = await db.recycler.findFirst({ where: { id: recyclerId } });
  if (!recycler) notFound();

  const fy = financialYearOf(new Date());
  const showCosts = can("costs.view");
  const [capacity, stats, certificates, ratings] = await Promise.all([
    recyclerCapacityUse(recycler.id, fy),
    recyclerPlatformStats([recycler.id], fy),
    db.certificate.findMany({
      where: { recyclerId: recycler.id, deletedAt: null },
      include: { category: { select: { name: true } } },
      orderBy: { issueDate: "desc" },
      take: 50,
    }),
    db.recyclerRating.findMany({ where: { recyclerId: recycler.id }, orderBy: { createdAt: "desc" } }),
  ]);
  const raters = await db.membership.findMany({
    where: { userId: { in: ratings.map((r) => r.userId) } },
    select: { userId: true, user: { select: { name: true, email: true } } },
  });
  const s = stats.get(recycler.id);
  const mine = ratings.find((r) => r.userId === user.id);

  const facts: [string, string][] = [
    ["CPCB registration", recycler.cpcbRegistrationNo ?? "—"],
    ["GSTIN", recycler.gstin ?? "—"],
    ["Location", [recycler.city, stateName(recycler.stateCode)].filter(Boolean).join(", ")],
    ["Registration valid", recycler.registrationValidFrom || recycler.registrationValidTo ? `${recycler.registrationValidFrom ? dateFormat.format(recycler.registrationValidFrom) : "?"} – ${recycler.registrationValidTo ? dateFormat.format(recycler.registrationValidTo) : "open"}` : "Not on record"],
    ["Contact", [recycler.contactEmail, recycler.contactPhone].filter(Boolean).join(" · ") || "—"],
    ["Listed by", recycler.organizationId ? "Your team (private)" : "EPRFlow directory"],
  ];

  return (
    <div className="grid gap-6">
      <PageHeader title={recycler.name} description={`${stateName(recycler.stateCode)}${s?.ratingAvg ? ` · rated ${s.ratingAvg.toFixed(1)}/5 by ${s.ratingCount} buyer(s) on EPRFlow` : ""}`} actions={<VerificationBadge status={recycler.verificationStatus} />} />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 text-sm sm:grid-cols-[12rem_1fr]">
              {facts.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Capacity — FY {fy}</CardTitle>
            <CardDescription>Registered annual processing capacity, and the share already certified by all EPRFlow buyers. Certificates beyond capacity are flagged.</CardDescription>
          </CardHeader>
          <CardContent>
            {capacity.length === 0 ? (
              <p className="text-sm text-muted-foreground">No capacity on record for this year.</p>
            ) : (
              <ul className="grid gap-4">
                {capacity.map((c) => {
                  const pct = Math.min(100, Math.round((c.utilisation ?? 0) * 100));
                  const high = (c.utilisation ?? 0) > 0.9;
                  return (
                    <li key={c.categoryId} className="grid gap-1.5 text-sm">
                      <div className="flex justify-between gap-2">
                        <span className="font-medium">{c.category.split(" – ")[0]}</span>
                        <span className="text-muted-foreground tabular-nums">
                          {formatTonnes(c.certifiedKg)} of {formatTonnes(c.capacityKg)} · {formatPercent(c.utilisation)}
                        </span>
                      </div>
                      <div role="progressbar" aria-label={`${c.category} capacity used`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="h-2 overflow-hidden rounded-full bg-muted">
                        <div className={cn("h-full rounded-full", high ? "bg-status-critical" : "bg-primary")} style={{ width: `${pct}%` }} />
                      </div>
                      {showCosts && c.medianPricePerKg !== null && <span className="text-xs text-muted-foreground">Median price on EPRFlow: ₹{c.medianPricePerKg.toFixed(2)}/kg</span>}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your certificates from this recycler</CardTitle>
          {showCosts && <CardDescription>Price history: what you paid per kg on each purchase.</CardDescription>}
        </CardHeader>
        <CardContent>
          {certificates.length === 0 ? (
            <p className="text-sm text-muted-foreground">None yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Certificate no.</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  {showCosts && <TableHead className="text-right">₹ per kg</TableHead>}
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {certificates.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link href={`/o/${orgSlug}/certificates/${c.id}`} className="font-mono text-sm underline-offset-4 hover:underline">
                        {c.certificateNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="tabular-nums">{dateFormat.format(c.issueDate)}</TableCell>
                    <TableCell>{c.category.name.split(" – ")[0]}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatTonnes(c.quantityKg.toString())}</TableCell>
                    {showCosts && <TableCell className="text-right tabular-nums">{c.pricePerKgInr ? `₹${Number(c.pricePerKgInr).toFixed(2)}` : "—"}</TableCell>}
                    <TableCell>
                      <CertificateStatusBadge status={c.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ratings from your team</CardTitle>
          </CardHeader>
          <CardContent>
            {ratings.length === 0 ? (
              <p className="text-sm text-muted-foreground">No one in your organisation has rated this recycler yet.</p>
            ) : (
              <ul className="grid gap-3">
                {ratings.map((r) => (
                  <li key={r.id} className="grid gap-0.5 text-sm">
                    <span className="flex items-center gap-2">
                      <span className="inline-flex" aria-label={`${r.rating} out of 5`}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <StarIcon key={n} aria-hidden className={cn("size-3.5", n <= r.rating ? "fill-status-warning text-status-warning" : "text-muted-foreground/40")} />
                        ))}
                      </span>
                      <span className="font-medium">{raters.find((p) => p.userId === r.userId)?.user.name ?? "Former member"}</span>
                    </span>
                    {r.comment && <span className="text-muted-foreground">{r.comment}</span>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        {can("certificates.write") && (
          <Card>
            <CardHeader>
              <CardTitle>Rate this recycler</CardTitle>
              <CardDescription>Ratings are shared with other buyers only as an average.</CardDescription>
            </CardHeader>
            <CardContent>
              <RatingForm orgSlug={orgSlug} recyclerId={recycler.id} current={mine ? { rating: mine.rating, comment: mine.comment } : undefined} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
