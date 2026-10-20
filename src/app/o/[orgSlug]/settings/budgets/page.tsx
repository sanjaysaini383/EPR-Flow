import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BudgetForm } from "@/features/compliance/components/budget-form";
import { getOrgContext } from "@/lib/auth/session";
import { financialYearOf, recentFinancialYears } from "@/lib/domain/financial-year";
import { formatInr, formatPercent } from "@/lib/format";

export const metadata: Metadata = { title: "Budgets" };

export default async function BudgetsPage({ params }: PageProps<"/o/[orgSlug]/settings/budgets">) {
  const { orgSlug } = await params;
  const { db, can } = await getOrgContext(orgSlug);

  if (!can("costs.view")) {
    return (
      <div className="grid gap-6">
        <PageHeader title="Budgets" />
        <p className="text-sm text-muted-foreground">Your role does not have access to cost information.</p>
      </div>
    );
  }

  const years = recentFinancialYears(new Date(), 4);
  const [budgets, spend] = await Promise.all([
    db.budget.findMany({ where: { categoryId: null, financialYear: { in: years } } }),
    db.certificate.groupBy({
      by: ["financialYear"],
      where: { deletedAt: null, status: "APPROVED", financialYear: { in: years } },
      _sum: { costInr: true },
    }),
  ]);
  const current = financialYearOf(new Date());

  return (
    <div className="grid max-w-3xl gap-6">
      <PageHeader title="Budgets" description="Yearly budget for buying EPR certificates, tracked against approved purchases." />

      {can("budgets.manage") && (
        <Card>
          <CardHeader>
            <CardTitle>Set a budget</CardTitle>
            <CardDescription>Only admins can change budgets. Changes are audit-logged.</CardDescription>
          </CardHeader>
          <CardContent>
            <BudgetForm
              orgSlug={orgSlug}
              years={years}
              defaultYear={current}
              existing={Object.fromEntries(budgets.map((b) => [b.financialYear, Number(b.amountInr)]))}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Financial year</TableHead>
                <TableHead className="text-right">Budget</TableHead>
                <TableHead className="text-right">Spent (approved)</TableHead>
                <TableHead className="text-right">Used</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {years.map((fy) => {
                const budget = budgets.find((b) => b.financialYear === fy);
                const spent = Number(spend.find((s) => s.financialYear === fy)?._sum.costInr ?? 0);
                const amount = budget ? Number(budget.amountInr) : null;
                return (
                  <TableRow key={fy}>
                    <TableCell className="font-medium">FY {fy}</TableCell>
                    <TableCell className="text-right tabular-nums">{amount === null ? "—" : formatInr(amount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatInr(spent)}</TableCell>
                    <TableCell className={`text-right tabular-nums ${amount !== null && spent > amount ? "font-medium text-status-critical" : ""}`}>
                      {amount ? formatPercent(spent / amount) : "—"}
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
