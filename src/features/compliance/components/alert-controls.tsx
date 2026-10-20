"use client";

import { CheckCheckIcon, CheckIcon } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { markAlertsReadAction } from "../actions";

export function MarkReadButton({ orgSlug, alertId }: { orgSlug: string; alertId: string | null }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant={alertId ? "ghost" : "outline"}
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await markAlertsReadAction(orgSlug, alertId);
          if (r.error) toast.error(r.error);
          else if (!alertId) toast.success(r.message);
        })
      }
    >
      {alertId ? <CheckIcon /> : <CheckCheckIcon />}
      {alertId ? "Mark read" : "Mark all as read"}
    </Button>
  );
}
