import { BadgeCheckIcon, CircleDashedIcon, ClockIcon, BanIcon, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS: Record<string, { label: string; icon: LucideIcon; tone: string }> = {
  VERIFIED: { label: "Verified", icon: BadgeCheckIcon, tone: "text-status-good" },
  PENDING: { label: "Verification pending", icon: ClockIcon, tone: "text-status-warning" },
  UNVERIFIED: { label: "Unverified", icon: CircleDashedIcon, tone: "text-status-serious" },
  SUSPENDED: { label: "Suspended", icon: BanIcon, tone: "text-status-critical" },
};

export function VerificationBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.UNVERIFIED;
  return (
    <Badge variant="outline" className="gap-1 whitespace-nowrap">
      <s.icon className={cn("size-3", s.tone)} aria-hidden />
      {s.label}
    </Badge>
  );
}

export const VERIFICATION_LABELS = Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [k, v.label]));
