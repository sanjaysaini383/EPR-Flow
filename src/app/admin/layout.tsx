import { ShieldIcon } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/app/logo";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { requirePlatformAdmin } from "@/lib/auth/session";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requirePlatformAdmin();
  return (
    <div className="min-h-svh">
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-background/80 px-6 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link href="/admin/rules">
            <Logo />
          </Link>
          <Badge variant="outline" className="gap-1">
            <ShieldIcon className="size-3" /> Platform admin
          </Badge>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="hidden sm:inline">{user.email}</span>
          <Link href="/o" className="hover:text-foreground">
            Back to app
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-7xl p-6">{children}</main>
    </div>
  );
}
