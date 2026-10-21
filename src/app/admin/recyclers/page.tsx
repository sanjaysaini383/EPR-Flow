import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { VerificationBadge } from "@/features/recyclers/verification-badge";
import { prisma } from "@/lib/db/client";
import { dateKey } from "@/lib/domain/deadlines/schedule";
import { financialYearOf, formatFinancialYear, parseFinancialYear } from "@/lib/domain/financial-year";
import { stateName } from "@/lib/domain/states";
import { formatTonnes } from "@/lib/domain/units";
import { AdminNav } from "../admin-nav";
import { CapacityDialog, RecyclerDialog } from "./dialogs";

export const metadata: Metadata = { title: "Recyclers — Admin" };

const dateFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default async function AdminRecyclersPage() {
  const fy = financialYearOf(new Date());
  const start = parseFinancialYear(fy).startYear;
  const years = [formatFinancialYear(start + 1), fy, formatFinancialYear(start - 1)];

  const [recyclers, categories, privateCount] = await Promise.all([
    prisma.recycler.findMany({
      where: { organizationId: null },
      include: { capacities: { where: { financialYear: fy }, include: { category: { select: { name: true, sortOrder: true } } } } },
      orderBy: { name: "asc" },
    }),
    prisma.materialCategory.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: [{ stream: "asc" }, { sortOrder: "asc" }] }),
    prisma.recycler.count({ where: { organizationId: { not: null } } }),
  ]);
  const unverified = recyclers.filter((r) => r.verificationStatus !== "VERIFIED").length;

  return (
    <div className="grid gap-6">
      <AdminNav />
      <PageHeader
        title="Recycler directory"
        description={`Platform recyclers every organisation can buy from. ${unverified} not verified · ${privateCount} private recycler(s) added by organisations.`}
        actions={<RecyclerDialog />}
      />
      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Recycler</TableHead>
                <TableHead>Registration</TableHead>
                <TableHead>Valid until</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Capacity FY {fy}</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recyclers.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground">{[r.city, stateName(r.stateCode)].filter(Boolean).join(", ")}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.cpcbRegistrationNo ?? "—"}</TableCell>
                  <TableCell className="tabular-nums">{r.registrationValidTo ? dateFormat.format(r.registrationValidTo) : "—"}</TableCell>
                  <TableCell>
                    <VerificationBadge status={r.verificationStatus} />
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.capacities.length === 0
                      ? "—"
                      : r.capacities
                          .sort((a, b) => a.category.sortOrder - b.category.sortOrder)
                          .map((c) => `${c.category.name.split(" – ")[0].replace("Category ", "Cat ")}: ${formatTonnes(c.annualCapacityKg.toString())}`)
                          .join(" · ")}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <CapacityDialog recyclerId={r.id} name={r.name} categories={categories} years={years} />
                      <RecyclerDialog
                        recycler={{
                          id: r.id,
                          name: r.name,
                          cpcbRegistrationNo: r.cpcbRegistrationNo ?? "",
                          stateCode: r.stateCode,
                          city: r.city ?? "",
                          contactEmail: r.contactEmail ?? "",
                          contactPhone: r.contactPhone ?? "",
                          verificationStatus: r.verificationStatus,
                          registrationValidFrom: r.registrationValidFrom ? dateKey(r.registrationValidFrom) : "",
                          registrationValidTo: r.registrationValidTo ? dateKey(r.registrationValidTo) : "",
                        }}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
