"use client";

import { ArchiveIcon, ArchiveRestoreIcon } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setArchivedAction } from "@/features/structure/actions";

export function ArchiveButton({
  orgSlug,
  kind,
  id,
  archived,
  name,
}: {
  orgSlug: string;
  kind: "brand" | "plant" | "gst";
  id: string;
  archived: boolean;
  name: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (!archived && !confirm(`Archive ${name}? It will be hidden from forms and imports; existing data is kept.`)) return;
        startTransition(async () => {
          const result = await setArchivedAction(orgSlug, kind, id, !archived);
          if (result.error) toast.error(result.error);
          else toast.success(result.message);
        });
      }}
    >
      {archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
      {archived ? "Restore" : "Archive"}
    </Button>
  );
}
