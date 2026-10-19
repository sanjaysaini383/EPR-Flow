import { cookies } from "next/headers";
import { AppBreadcrumb } from "@/components/app/app-breadcrumb";
import { AppSidebar } from "@/components/app/app-sidebar";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { getOrgContext, listUserOrganizations, rememberActiveOrg } from "@/lib/auth/session";

export default async function OrgLayout({ children, params }: LayoutProps<"/o/[orgSlug]">) {
  const { orgSlug } = await params;
  const { user, org, role } = await getOrgContext(orgSlug);
  const [orgs, cookieStore] = await Promise.all([
    listUserOrganizations(user.id),
    cookies(),
    rememberActiveOrg(user, org.id),
  ]);

  return (
    <SidebarProvider defaultOpen={cookieStore.get("sidebar_state")?.value !== "false"}>
      <AppSidebar
        org={{ id: org.id, slug: org.slug, name: org.name, role }}
        orgs={orgs}
        user={{ name: user.name, email: user.email, image: user.image }}
      />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <AppBreadcrumb orgName={org.name} orgSlug={org.slug} />
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>
        <div className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-6 lg:p-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
