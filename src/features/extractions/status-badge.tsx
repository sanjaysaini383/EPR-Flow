import { CircleCheckIcon, CircleXIcon, EyeIcon, LoaderCircleIcon, OctagonAlertIcon, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS: Record<string, { label: string; icon: LucideIcon; tone: string; spin?: boolean }> = {
  QUEUED: { label: "Queued", icon: LoaderCircleIcon, tone: "text-muted-foreground", spin: true },
  PROCESSING: { label: "Reading…", icon: LoaderCircleIcon, tone: "text-primary", spin: true },
  NEEDS_REVIEW: { label: "Needs review", icon: EyeIcon, tone: "text-status-warning" },
  APPROVED: { label: "Approved", icon: CircleCheckIcon, tone: "text-status-good" },
  REJECTED: { label: "Discarded", icon: CircleXIcon, tone: "text-muted-foreground" },
  FAILED: { label: "Needs manual entry", icon: OctagonAlertIcon, tone: "text-status-serious" },
};

export function ExtractionStatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.QUEUED;
  return (
    <Badge variant="outline" className="gap-1 whitespace-nowrap">
      <s.icon className={cn("size-3", s.tone, s.spin && "animate-spin motion-reduce:animate-none")} aria-hidden />
      {s.label}
    </Badge>
  );
}
