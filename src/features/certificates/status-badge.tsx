import { CircleCheckIcon, CircleDashedIcon, ClockIcon, CircleXIcon, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_LABELS } from "./service";

const STYLE: Record<string, { icon: LucideIcon; tone: string }> = {
  DRAFT: { icon: CircleDashedIcon, tone: "text-muted-foreground" },
  PENDING_APPROVAL: { icon: ClockIcon, tone: "text-status-warning" },
  APPROVED: { icon: CircleCheckIcon, tone: "text-status-good" },
  REJECTED: { icon: CircleXIcon, tone: "text-status-critical" },
};

/** Status is never colour-alone: icon + label. */
export function CertificateStatusBadge({ status }: { status: string }) {
  const s = STYLE[status] ?? STYLE.DRAFT;
  return (
    <Badge variant="outline" className="gap-1 whitespace-nowrap">
      <s.icon className={cn("size-3", s.tone)} aria-hidden />
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}
