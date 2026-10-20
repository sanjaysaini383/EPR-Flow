import { CircleAlertIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { prisma } from "@/lib/db/client";
import { cn } from "@/lib/utils";
import { RuleEditDialog } from "./rule-edit-dialog";

export const metadata: Metadata = { title: "Regulation rules" };

const RULE_LABELS: Record<string, string> = {
  EPR_TARGET: "EPR target",
  RECYCLING_TARGET: "Minimum recycling",
  RECYCLED_CONTENT: "Recycled content",
  EC_RATE: "EC rate",
  FILING_DEADLINE: "Filing deadline",
  COLLECTION_TARGET: "Collection",
  END_OF_LIFE_TARGET: "End-of-life",
  REUSE_TARGET: "Reuse",
};
const STREAMS = ["PLASTIC", "EWASTE", "BATTERY"] as const;

export default async function RulesPage({ searchParams }: PageProps<"/admin/rules">) {
  const { stream: raw } = await searchParams;
  const stream = STREAMS.find((s) => s === raw) ?? "PLASTIC";

  const [rules, categories] = await Promise.all([
    prisma.regulationRule.findMany({
      where: { stream },
      orderBy: [{ ruleType: "asc" }, { categoryId: "asc" }, { effectiveFrom: "asc" }, { version: "desc" }],
    }),
    prisma.materialCategory.findMany({ select: { id: true, name: true } }),
  ]);
  const categoryName = new Map(categories.map((c) => [c.id, c.name.split(" – ")[0]]));
  const scopeKey = (r: (typeof rules)[number]) =>
    [r.ruleType, r.categoryId, r.entityType, r.financialYear, r.effectiveFrom.toISOString()].join("|");
  const latestVersion = new Map<string, number>();
  for (const r of rules) latestVersion.set(scopeKey(r), Math.max(latestVersion.get(scopeKey(r)) ?? 0, r.version));
  const unverifiedCurrent = rules.filter((r) => r.version === latestVersion.get(scopeKey(r)) && !r.isVerified).length;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Regulation rules"
        description="Targets, recycled-content obligations and EC rates used by every organisation's calculations."
      />

      <nav className="flex gap-2" aria-label="Waste stream">
        {STREAMS.map((s) => (
          <Link
            key={s}
            href={`?stream=${s}`}
            className={cn("rounded-lg border px-3 py-1.5 text-sm", s === stream ? "border-primary bg-brand-soft font-medium" : "hover:bg-muted")}
          >
            {s === "PLASTIC" ? "Plastic" : s === "EWASTE" ? "E-waste" : "Battery"}
          </Link>
        ))}
      </nav>

      {unverifiedCurrent > 0 && (
        <Alert className="border-status-warning/50">
          <CircleAlertIcon className="text-status-warning" />
          <AlertTitle>{unverifiedCurrent} rule(s) in force are unverified</AlertTitle>
          <AlertDescription>
            Check each value against the latest CPCB notification, then save it with “Verified” ticked. Saving always creates a new version.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rule</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Applies</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((r) => {
                const superseded = r.version < (latestVersion.get(scopeKey(r)) ?? r.version);
                return (
                  <TableRow key={r.id} className={superseded ? "text-muted-foreground opacity-60" : undefined}>
                    <TableCell className="font-medium">{RULE_LABELS[r.ruleType] ?? r.ruleType}</TableCell>
                    <TableCell>
                      {r.categoryId ? categoryName.get(r.categoryId) : "All categories"}
                      {r.entityType && <div className="text-xs text-muted-foreground">{r.entityType.replace("_", " ").toLowerCase()}</div>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {r.financialYear
                        ? `FY ${r.financialYear}`
                        : `From ${r.effectiveFrom.toISOString().slice(0, 10)}${r.effectiveTo ? ` to ${r.effectiveTo.toISOString().slice(0, 10)}` : ""}`}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.unit === "PERCENT" ? `${Number(r.value)}%` : r.unit === "INR_PER_KG" ? `₹${Number(r.value)}/kg` : "—"}
                      {r.parameters ? <div className="max-w-48 truncate font-mono text-[11px] text-muted-foreground">{JSON.stringify(r.parameters)}</div> : null}
                    </TableCell>
                    <TableCell>
                      v{r.version}
                      {superseded && <div className="text-xs">superseded</div>}
                    </TableCell>
                    <TableCell>
                      {r.isVerified ? <Badge variant="secondary">Verified</Badge> : <Badge variant="outline" className="border-status-warning/60">Unverified</Badge>}
                    </TableCell>
                    <TableCell className="max-w-56 truncate text-xs text-muted-foreground" title={r.sourceReference ?? undefined}>
                      {r.sourceReference ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {!superseded && (
                        <RuleEditDialog
                          rule={{
                            id: r.id,
                            label: `${RULE_LABELS[r.ruleType] ?? r.ruleType} · ${r.categoryId ? categoryName.get(r.categoryId) : "All categories"}${r.financialYear ? ` · FY ${r.financialYear}` : ""}`,
                            value: String(Number(r.value)),
                            unit: r.unit,
                            parameters: r.parameters ? JSON.stringify(r.parameters) : "",
                            sourceReference: r.sourceReference ?? "",
                            notes: r.notes ?? "",
                            isVerified: r.isVerified,
                            version: r.version,
                          }}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
