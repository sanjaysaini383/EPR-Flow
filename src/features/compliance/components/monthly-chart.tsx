"use client";

import { ChartColumnIcon, TableIcon } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type MonthlySeries = { key: string; label: string };
export type MonthlyRow = { month: string } & Record<string, number | string>;

// Categorical slots in fixed order (validated CVD-safe); a 5th+ series folds into "Other".
const SLOTS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];
const OTHER = "var(--muted-foreground)";
const tonnes = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });

/** Stacked monthly tonnes by category, with a table view (contrast relief + accessibility). */
export function MonthlyChart({ rows, series }: { rows: MonthlyRow[]; series: MonthlySeries[] }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const colour = (i: number) => SLOTS[i] ?? OTHER;
  const total = (r: MonthlyRow) => series.reduce((s, x) => s + Number(r[x.key] ?? 0), 0);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
          {series.map((s, i) => (
            <li key={s.key} className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px]" style={{ background: colour(i) }} aria-hidden />
              {s.label}
            </li>
          ))}
        </ul>
        <div className="flex rounded-lg border p-0.5" role="group" aria-label="View">
          <Button size="xs" variant={view === "chart" ? "secondary" : "ghost"} onClick={() => setView("chart")} aria-pressed={view === "chart"}>
            <ChartColumnIcon /> Chart
          </Button>
          <Button size="xs" variant={view === "table" ? "secondary" : "ghost"} onClick={() => setView("table")} aria-pressed={view === "table"}>
            <TableIcon /> Table
          </Button>
        </div>
      </div>

      {view === "chart" ? (
        <div className="h-64 w-full" role="img" aria-label="Monthly quantity placed on market by category, in tonnes">
          <ResponsiveContainer>
            <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: -12 }} barCategoryGap="22%">
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} interval="preserveStartEnd" minTickGap={8} />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickFormatter={(v: number) => `${tonnes.format(v)} t`} width={56} />
              <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={({ active, payload, label }) => (
                  <ChartTooltip active={active} payload={payload} label={label} series={series} colour={colour} />
                )} />
              {series.map((s, i) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  stackId="qty"
                  fill={colour(i)}
                  stroke="var(--card)"
                  strokeWidth={2}
                  radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
                  maxBarSize={28}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="max-h-64 overflow-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                {series.map((s) => (
                  <TableHead key={s.key} className="text-right">
                    {s.label}
                  </TableHead>
                ))}
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.month}>
                  <TableCell>{r.month}</TableCell>
                  {series.map((s) => (
                    <TableCell key={s.key} className="text-right tabular-nums">
                      {tonnes.format(Number(r[s.key] ?? 0))} t
                    </TableCell>
                  ))}
                  <TableCell className="text-right font-medium tabular-nums">{tonnes.format(total(r))} t</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>Total</TableCell>
                {series.map((s) => (
                  <TableCell key={s.key} className="text-right tabular-nums">
                    {tonnes.format(rows.reduce((sum, r) => sum + Number(r[s.key] ?? 0), 0))} t
                  </TableCell>
                ))}
                <TableCell className="text-right tabular-nums">{tonnes.format(rows.reduce((sum, r) => sum + total(r), 0))} t</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  series,
  colour,
}: {
  active?: boolean;
  payload?: readonly { dataKey?: unknown; value?: unknown }[];
  label?: unknown;
  series: MonthlySeries[];
  colour: (i: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const sum = payload.reduce((s, p) => s + Number(p.value ?? 0), 0);
  return (
    <div className="grid min-w-44 gap-1 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="font-medium">{String(label ?? "")}</p>
      {series.map((s, i) => {
        const p = payload.find((x) => x.dataKey === s.key);
        if (!p || !Number(p.value)) return null;
        return (
          <p key={s.key} className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2 rounded-[2px]" style={{ background: colour(i) }} aria-hidden />
              {s.label}
            </span>
            <span className="tabular-nums">{tonnes.format(Number(p.value))} t</span>
          </p>
        );
      })}
      <p className="mt-0.5 flex justify-between border-t pt-1 font-medium">
        <span>Total</span>
        <span className="tabular-nums">{tonnes.format(sum)} t</span>
      </p>
    </div>
  );
}
