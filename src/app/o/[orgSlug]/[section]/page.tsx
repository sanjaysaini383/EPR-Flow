import { ConstructionIcon } from "lucide-react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { getOrgContext } from "@/lib/auth/session";
import { NAV } from "@/lib/nav";

/**
 * Placeholder for sidebar sections that ship in a later phase.
 * Real pages (static segments) take precedence over this dynamic route as they are added.
 */
export default async function UpcomingSectionPage({ params }: PageProps<"/o/[orgSlug]/[section]">) {
  const { orgSlug, section } = await params;
  await getOrgContext(orgSlug);

  const item = NAV.flatMap((g) => g.items).find((i) => i.path === section && i.phase);
  if (!item) notFound();

  return (
    <div className="grid gap-6">
      <PageHeader title={item.label} />
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <ConstructionIcon className="size-10 text-muted-foreground" />
          <p className="font-medium">Coming in phase {item.phase}</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            This section is part of the build plan and will be available in an upcoming release.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
