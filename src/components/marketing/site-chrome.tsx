import Link from "next/link";
import { Logo } from "@/components/app/logo";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-transparent bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="EPRFlow home">
          <Logo />
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1">
          <Button asChild variant="ghost" className="hidden sm:inline-flex">
            <Link href="/#features">Features</Link>
          </Button>
          <Button asChild variant="ghost" className="hidden sm:inline-flex">
            <Link href="/pricing">Pricing</Link>
          </Button>
          <ThemeToggle />
          <Button asChild variant="ghost">
            <Link href="/login">Log in</Link>
          </Button>
          <Button asChild className="hidden sm:inline-flex">
            <Link href="/signup">Get started</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 text-sm text-muted-foreground sm:grid-cols-[1fr_auto] sm:px-6">
        <div className="grid gap-2">
          <Logo className="text-foreground" />
          <p className="max-w-md">
            EPR compliance for Indian producers, importers and brand owners. Regulatory values shown in the app must be verified against the latest CPCB notifications.
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 sm:justify-end">
          <Link href="/#features" className="hover:text-foreground">
            Features
          </Link>
          <Link href="/pricing" className="hover:text-foreground">
            Pricing
          </Link>
          <Link href="/login" className="hover:text-foreground">
            Log in
          </Link>
          <a href="mailto:hello@eprflow.in" className="hover:text-foreground">
            Contact
          </a>
        </nav>
      </div>
    </footer>
  );
}
