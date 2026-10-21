import { CheckIcon, MinusIcon } from "lucide-react";
import type { Metadata } from "next";
import { PricingCards } from "@/components/marketing/pricing-cards";
import { SiteFooter, SiteHeader } from "@/components/marketing/site-chrome";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Starter, Growth and Enterprise plans for EPR compliance: targets, certificate fraud checks, AI document reading, reminders and CPCB reports.",
};

type Cell = boolean | string;
const ROWS: [string, Cell, Cell, Cell][] = [
  ["Waste streams", "Plastic", "Plastic, e-waste, battery", "All"],
  ["GSTINs / brands / plants", "2 / 5 / 5", "Unlimited", "Unlimited"],
  ["Team members", "3", "15", "Unlimited"],
  ["Material entry and Excel / CSV import", true, true, true],
  ["EPR targets, EC risk and alerts", true, true, true],
  ["Compliance calendar and email reminders", true, true, true],
  ["CPCB annual return (Excel / PDF)", true, true, true],
  ["Certificate workflow and fraud checks", false, true, true],
  ["Recycler directory, ratings and price history", false, true, true],
  ["AI reading of certificates and invoices", false, "500 / year", "Unlimited"],
  ["Budgets, registers and audit log export", false, true, true],
  ["Consultant view across client companies", false, false, true],
  ["Onboarding and data migration", false, false, true],
  ["Support", "Email", "Email, 1 business day", "Named contact"],
];

function Value({ v }: { v: Cell }) {
  if (v === true) return <CheckIcon className="mx-auto size-4 text-primary" aria-label="Included" />;
  if (v === false) return <MinusIcon className="mx-auto size-4 text-muted-foreground/60" aria-label="Not included" />;
  return <span>{v}</span>;
}

export default function PricingPage() {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-16 sm:px-6">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h1 className="text-4xl font-semibold tracking-tight">Pricing</h1>
          <p className="mt-3 text-muted-foreground">Per company, billed yearly. Every plan starts with a 30-day free trial — no card needed.</p>
        </div>
        <PricingCards />

        <h2 className="mt-20 mb-6 text-2xl font-semibold tracking-tight">Compare plans</h2>
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-56">Feature</TableHead>
                <TableHead className="text-center">Starter</TableHead>
                <TableHead className="text-center">Growth</TableHead>
                <TableHead className="text-center">Enterprise</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ROWS.map(([label, ...values]) => (
                <TableRow key={label}>
                  <TableCell className="font-medium whitespace-normal">{label}</TableCell>
                  {values.map((v, i) => (
                    <TableCell key={i} className="text-center text-sm">
                      <Value v={v} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          Indicative prices in INR, excluding GST. Plan limits are shown for planning; EPRFlow does not yet block usage above them.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
