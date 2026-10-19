"use client";

import {
  BellIcon,
  Building2Icon,
  CalendarDaysIcon,
  CheckIcon,
  ChevronsUpDownIcon,
  FactoryIcon,
  FileCheck2Icon,
  FileSpreadsheetIcon,
  HistoryIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  PackageIcon,
  PlusIcon,
  ReceiptIndianRupeeIcon,
  RecycleIcon,
  ScanTextIcon,
  SettingsIcon,
  TagIcon,
  TargetIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/app/(auth)/actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { ROLE_LABELS, type Role } from "@/lib/domain/permissions";
import { NAV, type NavIcon } from "@/lib/nav";

const ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboardIcon,
  alerts: BellIcon,
  materials: PackageIcon,
  brands: TagIcon,
  plants: FactoryIcon,
  gst: ReceiptIndianRupeeIcon,
  targets: TargetIcon,
  certificates: FileCheck2Icon,
  recyclers: RecycleIcon,
  extraction: ScanTextIcon,
  reports: FileSpreadsheetIcon,
  calendar: CalendarDaysIcon,
  audit: HistoryIcon,
  settings: SettingsIcon,
  members: UsersIcon,
};

type Org = { id: string; slug: string; name: string; role: Role };
type User = { name: string | null; email: string; image: string | null };

export function AppSidebar({ org, orgs, user }: { org: Org; orgs: Org[]; user: User }) {
  const pathname = usePathname();
  const base = `/o/${org.slug}`;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <OrgSwitcher org={org} orgs={orgs} />
      </SidebarHeader>
      <SidebarContent>
        {NAV.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const href = `${base}/${item.path}`;
                  const Icon = ICONS[item.icon];
                  // "settings" must not stay active on "settings/members"
                  const active = pathname === href || (item.path !== "settings" && pathname.startsWith(`${href}/`));
                  return (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                        <Link href={href}>
                          <Icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                      {item.phase && <SidebarMenuBadge className="text-[10px] text-muted-foreground">Soon</SidebarMenuBadge>}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <UserMenu user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function OrgSwitcher({ org, orgs }: { org: Org; orgs: Org[] }) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
              <span className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <Building2Icon className="size-4" />
              </span>
              <span className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{org.name}</span>
                <span className="truncate text-xs text-muted-foreground">{ROLE_LABELS[org.role]}</span>
              </span>
              <ChevronsUpDownIcon className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-60" align="start">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Organizations</DropdownMenuLabel>
            {orgs.map((o) => (
              <DropdownMenuItem key={o.id} asChild>
                <Link href={`/o/${o.slug}/dashboard`}>
                  <span className="flex-1 truncate">{o.name}</span>
                  {o.id === org.id && <CheckIcon />}
                </Link>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/onboarding">
                <PlusIcon /> Add organization
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function UserMenu({ user }: { user: User }) {
  const initials = (user.name ?? user.email)
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
              <Avatar className="size-8 rounded-lg">
                {user.image && <AvatarImage src={user.image} alt="" />}
                <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
              </Avatar>
              <span className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name ?? "Account"}</span>
                <span className="truncate text-xs text-muted-foreground">{user.email}</span>
              </span>
              <ChevronsUpDownIcon className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-56" side="top" align="start">
            <DropdownMenuItem asChild>
              <form action={signOutAction} className="w-full">
                <button type="submit" className="flex w-full items-center gap-2">
                  <LogOutIcon /> Log out
                </button>
              </form>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
