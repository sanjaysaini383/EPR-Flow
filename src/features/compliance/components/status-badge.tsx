import { CircleAlertIcon, CircleCheckIcon, CircleDashedIcon, CircleHelpIcon, OctagonAlertIcon, TriangleAlertIcon, type LucideIcon } from "lucide-react";
import type { ObligationStatus } from "@/lib/domain/obligations/calculate";
import { cn } from "@/lib/utils";

/** Status is never colour-alone: every badge carries an icon and a label. */
const STATUS: Record<ObligationStatus, { label: string; icon: LucideIcon; tone: string }> = {
  MET: { label: "Met", icon: CircleCheckIcon, tone: "text-status-good" },
  ON_TRACK: { label: "On track", icon: CircleCheckIcon, tone: "text-status-good" },
  BEHIND: { label: "Behind", icon: TriangleAlertIcon, tone: "text-status-warning" },
  AT_RISK: { label: "At risk", icon: OctagonAlertIcon, tone: "text-status-critical" },
  SHORTFALL: { label: "Shortfall", icon: CircleAlertIcon, tone: "text-status-critical" },
  NO_RULE: { label: "No rule", icon: CircleHelpIcon, tone: "text-status-serious" },
  NO_OBLIGATION: { label: "No obligation", icon: CircleDashedIcon, tone: "text-muted-foreground" },
};

export function statusLabel(status: ObligationStatus) {
  return STATUS[status].label;
}

export function StatusBadge({ status, className }: { status: ObligationStatus; className?: string }) {
  const { label, icon: Icon, tone } = STATUS[status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap text-foreground", className)}>
      <Icon className={cn("size-3.5", tone)} aria-hidden />
      {label}
    </span>
  );
}
