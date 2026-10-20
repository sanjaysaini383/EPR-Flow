"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ObligationStatus } from "@/lib/domain/obligations/calculate";
import { formatTonnes } from "@/lib/domain/units";
import { StatusBadge } from "./status-badge";

export type BarLine = {
  code: string;
  label: string;
  targetKg: number;
  fulfilledKg: number;
  recyclingTargetKg: number;
  progress: number | null;
  expectedProgress: number;
  status: ObligationStatus;
};

/**
 * Bullet bars: the track is the target, the fill is what's fulfilled, and the tick marks
 * where you should be given how much of the year has passed. Hover for exact figures.
 */
export function ObligationBars({ lines }: { lines: BarLine[] }) {
  return (
    <ul className="grid gap-5">
      {lines.map((l) => {
        const pct = l.progress === null ? 0 : Math.min(1, l.progress);
        const expected = Math.min(1, l.expectedProgress);
        return (
          <li key={l.code} className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-sm font-medium" title={l.label}>
                {l.label}
              </span>
              <StatusBadge status={l.status} />
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  role="img"
                  aria-label={`${l.label}: ${formatTonnes(l.fulfilledKg)} of ${formatTonnes(l.targetKg)} fulfilled (${Math.round(pct * 100)}%); expected ${Math.round(expected * 100)}% by now`}
                  className="relative h-3 cursor-default rounded-full bg-muted py-4 [background-clip:content-box]"
                >
                  <div
                    className="absolute top-4 left-0 h-3 rounded-full bg-primary transition-[width]"
                    style={{ width: `${pct * 100}%`, minWidth: pct > 0 ? 6 : 0 }}
                  />
                  <div
                    className="absolute top-2.5 h-6 w-0.5 rounded-full bg-foreground/70"
                    style={{ left: `calc(${expected * 100}% - 1px)` }}
                    aria-hidden
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="grid gap-0.5 text-xs">
                <span className="font-medium">{l.label}</span>
                <span>Fulfilled: {formatTonnes(l.fulfilledKg)}</span>
                <span>Target: {formatTonnes(l.targetKg)} (recycling ≥ {formatTonnes(l.recyclingTargetKg)})</span>
                <span>Expected by now: {Math.round(expected * 100)}%</span>
              </TooltipContent>
            </Tooltip>
            <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
              <span>
                {formatTonnes(l.fulfilledKg)} of {formatTonnes(l.targetKg)}
              </span>
              <span className="font-medium text-foreground">{l.progress === null ? "—" : `${Math.round(l.progress * 100)}%`}</span>
            </div>
          </li>
        );
      })}
      <li className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-full bg-primary" aria-hidden /> Fulfilled
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-0.5 rounded-full bg-foreground/70" aria-hidden /> Expected by today
        </span>
      </li>
    </ul>
  );
}
