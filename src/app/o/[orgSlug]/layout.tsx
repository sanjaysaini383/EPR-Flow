import { BellIcon } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { AppBreadcrumb } from "@/components/app/app-breadcrumb";
import { AppSidebar } from "@/components/app/app-sidebar";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { getOrgContext, listUserOrganizations, rememberActiveOrg } from "@/lib/auth/session";

export default async function OrgLayout({ children, params }: LayoutProps<"/o/[orgSlug]">) {
  const { orgSlug } = await params;
  const { user, org, role, db } = await getOrgContext(orgSlug);
  const [orgs, cookieStore, unreadAlerts] = await Promise.all([
    listUserOrganizations(user.id),
    cookies(),
    db.alert.count({ where: { resolvedAt: null, readAt: null } }),
    rememberActiveOrg(user, org.id),
  ]);

  return (
    <SidebarProvider defaultOpen={cookieStore.get("sidebar_state")?.value !== "false"}>
      <AppSidebar
        org={{ id: org.id, slug: org.slug, name: org.name, role }}
        orgs={orgs}
        user={{ name: user.name, email: user.email, image: user.image, isPlatformAdmin: user.isPlatformAdmin }}
      />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <AppBreadcrumb orgName={org.name} orgSlug={org.slug} />
          <div className="ml-auto flex items-center gap-1">
            <Link
              href={`/o/${org.slug}/alerts`}
              className="relative flex size-8 items-center justify-center rounded-lg hover:bg-muted"
              aria-label={unreadAlerts ? `Alerts, ${unreadAlerts} unread` : "Alerts"}
            >
              <BellIcon className="size-4" />
              {unreadAlerts > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-status-critical px-1 text-[10px] leading-4 font-semibold text-white">
                  {unreadAlerts > 9 ? "9+" : unreadAlerts}
                </span>
              )}
            </Link>
            <ThemeToggle />
          </div>
        </header>
        <div className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-6 lg:p-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
