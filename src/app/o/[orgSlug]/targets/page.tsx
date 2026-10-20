import { CircleAlertIcon, InfoIcon } from "lucide-react";
import type { Metadata } from "next";
import { after } from "next/server";
import { FySelect } from "@/components/app/fy-select";
import { PageHeader } from "@/components/app/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ObligationBars } from "@/features/compliance/components/obligation-bars";
import { StatusBadge } from "@/features/compliance/components/status-badge";
import { computeCompliance, syncCompliance } from "@/features/compliance/service";
import { getOrgContext } from "@/lib/auth/session";
import { financialYearOf, isFinancialYear, recentFinancialYears } from "@/lib/domain/financial-year";
import { stateName } from "@/lib/domain/states";
import { formatTonnes } from "@/lib/domain/units";
import { formatInr, formatPercent } from "@/lib/format";

export const metadata: Metadata = { title: "Targets" };

const RULE_LABELS: Record<string, string> = {
  EPR_TARGET: "EPR target",
  RECYCLING_TARGET: "Minimum recycling",
  RECYCLED_CONTENT: "Recycled content",
  EC_RATE: "Environmental Compensation rate",
  END_OF_LIFE_TARGET: "End-of-life",
  REUSE_TARGET: "Reuse",
  COLLECTION_TARGET: "Collection",
  FILING_DEADLINE: "Filing deadline",
};
const short = (name: string) => name.split(" – ")[0];

export default async function TargetsPage({ params, searchParams }: PageProps<"/o/[orgSlug]/targets">) {
  const { orgSlug } = await params;
  const { fy: rawFy } = await searchParams;
  const { db, org } = await getOrgContext(orgSlug);

  const currentFy = financialYearOf(new Date());
  const fy = typeof rawFy === "string" && isFinancialYear(rawFy) ? rawFy : currentFy;
  const years = recentFinancialYears(new Date(), 4);
  const result = await computeCompliance(db, org, fy);
  if (fy === currentFy) after(() => syncCompliance(db, org, result));

  const categoryName = new Map(result.lines.map((l) => [l.category.id, short(l.category.name)]));
  const states = [...new Set(result.lines.flatMap((l) => l.byState.map((s) => s.stateCode)))];

  return (
    <div className="grid gap-6">
      <PageHeader
        title="EPR targets"
        description={`Obligations for FY ${fy}, calculated from your material data and the regulation rules in force.`}
        actions={<FySelect years={years} value={fy} />}
      />

      {result.unverifiedRules.length > 0 && (
        <Alert className="border-status-warning/50">
          <CircleAlertIcon className="text-status-warning" />
          <AlertTitle>Placeholder regulation values</AlertTitle>
          <AlertDescription>
            {result.unverifiedRules.length} rule value(s) used below have not been verified against the latest CPCB notification. Treat
            these figures as estimates until an administrator verifies them.
          </AlertDescription>
        </Alert>
      )}

      {result.lines.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No material data for FY {fy} or the years its target is based on. Add material entries to see obligations.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Tile label="Obligation fulfilled" value={formatPercent(result.score)} hint={`${formatPercent(result.fyProgress)} of the year elapsed`} emphasis />
            <Tile label="Total target" value={formatTonnes(result.totals.targetKg)} hint={`${result.lines.length} categor${result.lines.length === 1 ? "y" : "ies"}`} />
            <Tile label="Fulfilled" value={formatTonnes(result.totals.fulfilledKg)} hint="Approved certificates" />
            <Tile label="Remaining" value={formatTonnes(result.totals.shortfallKg)} hint="Still to be covered" />
            <Tile label="EC risk if unmet" value={formatInr(result.totals.estimatedEcInr)} hint="Shortfall × EC rate" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Obligation details</CardTitle>
              <CardDescription>
                Base = average of FY {result.lines[0].baseYears.join(" and FY ")} placed on market (pre-consumer waste excluded).
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Base</TableHead>
                    <TableHead className="text-right">Target</TableHead>
                    <TableHead className="text-right">Recycling min.</TableHead>
                    <TableHead className="text-right">Fulfilled</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                    <TableHead className="text-right">EC risk</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.lines.map((l) => (
                    <TableRow key={l.category.id}>
                      <TableCell className="font-medium">{short(l.category.name)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatTonnes(l.baseQuantityKg)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatTonnes(l.targetKg)}
                        <div className="text-xs text-muted-foreground">{l.targetPercent ?? "—"}% of base</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatTonnes(l.recyclingTargetKg)}
                        <div className="text-xs text-muted-foreground">{l.recyclingPercent ?? "—"}% of target</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatTonnes(l.fulfilledKg)}
                        <div className="text-xs text-muted-foreground">
                          R {formatTonnes(l.fulfilledRecyclingKg)} · EoL {formatTonnes(l.fulfilledEolKg)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatTonnes(l.shortfallKg)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatInr(l.estimatedEcInr)}
                        <div className="text-xs text-muted-foreground">₹{l.ecRateInrPerKg ?? "—"}/kg</div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={l.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right tabular-nums">{formatTonnes(result.lines.reduce((s, l) => s + l.baseQuantityKg, 0))}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatTonnes(result.totals.targetKg)}</TableCell>
                    <TableCell />
                    <TableCell className="text-right tabular-nums">{formatTonnes(result.totals.fulfilledKg)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatTonnes(result.totals.shortfallKg)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatInr(result.totals.estimatedEcInr)}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Progress by category</CardTitle>
                <CardDescription>Fulfilled versus target; the tick marks where you should be today.</CardDescription>
              </CardHeader>
              <CardContent>
                <ObligationBars
                  lines={result.lines.map((l) => ({
                    code: l.category.code,
                    label: short(l.category.name),
                    targetKg: l.targetKg,
                    fulfilledKg: l.fulfilledKg,
                    recyclingTargetKg: l.recyclingTargetKg,
                    progress: l.progress,
                    expectedProgress: l.expectedProgress,
                    status: l.status,
                  }))}
                />
              </CardContent>
            </Card>

            {result.lines.some((l) => l.recycledContentPercent !== null) && (
              <Card>
                <CardHeader>
                  <CardTitle>Recycled content</CardTitle>
                  <CardDescription>Mandatory share of recycled plastic in this year&apos;s packaging.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Required</TableHead>
                        <TableHead className="text-right">Reported</TableHead>
                        <TableHead className="text-right">Coverage</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.lines
                        .filter((l) => l.recycledContentPercent !== null)
                        .map((l) => {
                          const coverage = l.recycledContentRequiredKg > 0 ? l.recycledContentActualKg / l.recycledContentRequiredKg : null;
                          return (
                            <TableRow key={l.category.id}>
                              <TableCell>
                                {short(l.category.name)} <span className="text-xs text-muted-foreground">({l.recycledContentPercent}%)</span>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{formatTonnes(l.recycledContentRequiredKg)}</TableCell>
                              <TableCell className="text-right tabular-nums">{formatTonnes(l.recycledContentActualKg)}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                {coverage === null ? "—" : <StatusBadge status={coverage >= 1 ? "MET" : coverage >= 0.9 ? "BEHIND" : "AT_RISK"} />}{" "}
                                {formatPercent(coverage)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

          </div>

          <Card>
            <CardHeader>
              <CardTitle>Base quantity by state</CardTitle>
              <CardDescription>Where the obligation comes from — useful for state-wise reporting.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>State</TableHead>
                    {result.lines.map((l) => (
                      <TableHead key={l.category.id} className="text-right">
                        {categoryName.get(l.category.id)}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {states.map((st) => (
                    <TableRow key={st}>
                      <TableCell>{stateName(st)}</TableCell>
                      {result.lines.map((l) => {
                        const v = l.byState.find((s) => s.stateCode === st)?.baseQuantityKg ?? 0;
                        return (
                          <TableCell key={l.category.id} className="text-right tabular-nums">
                            {v ? formatTonnes(v) : "—"}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <InfoIcon className="size-4 text-primary" /> Rules applied
              </CardTitle>
              <CardDescription>
                Every number above comes from these versioned rules — none are hard-coded. Certificates count only once approved.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rule</TableHead>
                    <TableHead>Applies to</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Parameters</TableHead>
                    <TableHead>Verified</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...new Map(result.lines.flatMap((l) => l.rules).map((r) => [r.id, r])).values()]
                    .sort((a, b) => a.ruleType.localeCompare(b.ruleType))
                    .map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{RULE_LABELS[r.ruleType] ?? r.ruleType}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {r.categoryId ? categoryName.get(r.categoryId) : `All ${r.stream.toLowerCase()} categories`}
                          {r.financialYear ? ` · FY ${r.financialYear}` : ""}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.unit === "PERCENT" ? `${r.value}%` : r.unit === "INR_PER_KG" ? `₹${r.value}/kg` : r.value}
                        </TableCell>
                        <TableCell>v{r.version}</TableCell>
                        <TableCell className="max-w-64 truncate text-xs text-muted-foreground" title={r.parameters ? JSON.stringify(r.parameters) : undefined}>
                          {r.parameters?.baseMethod ? `Base: ${String(r.parameters.baseMethod).toLowerCase().replaceAll("_", " ")}` : "—"}
                        </TableCell>
                        <TableCell>
                          {r.isVerified ? <Badge variant="secondary">Verified</Badge> : <Badge variant="outline" className="border-status-warning/60">Placeholder</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Tile({ label, value, hint, emphasis }: { label: string; value: string; hint: string; emphasis?: boolean }) {
  return (
    <Card className={emphasis ? "gap-2 bg-brand-soft/40" : "gap-2"}>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className={emphasis ? "text-3xl tabular-nums" : "text-2xl tabular-nums"}>{value}</CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">{hint}</CardContent>
    </Card>
  );
}
