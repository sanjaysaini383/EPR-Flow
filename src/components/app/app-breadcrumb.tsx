"use client";

import { ChevronRightIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { NAV } from "@/lib/nav";

const LABELS = new Map(NAV.flatMap((g) => g.items.map((i) => [i.path, i.label] as const)));

/** "Org name › Section" derived from the current URL. */
export function AppBreadcrumb({ orgName, orgSlug }: { orgName: string; orgSlug: string }) {
  const pathname = usePathname();
  const rest = pathname.replace(`/o/${orgSlug}`, "").replace(/^\//, "");
  const label = LABELS.get(rest) ?? LABELS.get(rest.split("/")[0]);

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
      <span className="truncate text-muted-foreground">{orgName}</span>
      {label && (
        <>
          <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium">{label}</span>
        </>
      )}
    </nav>
  );
}
