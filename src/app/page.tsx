import {
  ArrowRightIcon,
  BellRingIcon,
  Building2Icon,
  FileCheck2Icon,
  FileSpreadsheetIcon,
  ScanTextIcon,
  ShieldCheckIcon,
  TargetIcon,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/app/logo";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";

const FEATURES = [
  {
    icon: TargetIcon,
    title: "Automatic EPR targets",
    body: "Category I–IV obligations calculated from your sales data using versioned, configurable CPCB rules.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Certificate fraud checks",
    body: "Duplicate numbers, unverified recyclers, capacity breaches and suspicious dates flagged before you pay.",
  },
  {
    icon: ScanTextIcon,
    title: "AI invoice extraction",
    body: "Upload invoices and let AI pull out material, weight, GSTIN and vendor — you just review and approve.",
  },
  {
    icon: BellRingIcon,
    title: "Deadline reminders",
    body: "Quarterly and annual return dates on one calendar, with email and WhatsApp-ready reminders.",
  },
  {
    icon: FileSpreadsheetIcon,
    title: "CPCB-ready reports",
    body: "Export annual returns and certificate registers to Excel or PDF in the portal's format.",
  },
  {
    icon: Building2Icon,
    title: "Multi-brand, multi-plant",
    body: "Brands, plants and GSTINs across states in one workspace — consultants manage all clients from one login.",
  },
];

// Home page; the pricing section ships in phase 7.
export default async function HomePage() {
  if (await getCurrentUser()) redirect("/o");

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-20 border-b border-transparent bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Logo />
          <nav className="flex items-center gap-1">
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

      <main className="flex-1">
        <section className="bg-brand-glow relative overflow-hidden">
          <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" aria-hidden />
          <div className="relative mx-auto flex max-w-4xl flex-col items-center gap-6 px-6 pt-20 pb-24 text-center sm:pt-28">
            <Badge variant="outline" className="gap-1.5 bg-background/60 px-3 py-1 backdrop-blur">
              <span className="size-1.5 rounded-full bg-primary" /> Built for PWM, E-Waste & Battery Rules 2022
            </Badge>
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
              EPR compliance <span className="text-primary">without the spreadsheets</span>
            </h1>
            <p className="max-w-2xl text-lg text-pretty text-muted-foreground">
              Track obligations, verify recycler certificates and file on time — across every brand, plant and state.
              Built for compliance teams at Indian producers, importers and brand owners.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-11 px-6">
                <Link href="/signup">
                  Start free <ArrowRightIcon />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-11 bg-background/60 px-6">
                <Link href="/login">Log in to your workspace</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-20">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight">Everything your EPR filing needs</h2>
            <p className="mt-3 text-muted-foreground">From the first invoice to the CPCB annual return.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="group rounded-xl border bg-card p-6 transition-colors hover:border-primary/40 hover:bg-brand-soft/40"
              >
                <span className="mb-4 flex size-10 items-center justify-center rounded-lg bg-brand-soft text-primary">
                  <Icon className="size-5" />
                </span>
                <h3 className="font-medium">{title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-24">
          <div className="flex flex-col items-center gap-4 rounded-2xl border bg-primary px-6 py-12 text-center text-primary-foreground">
            <FileCheck2Icon className="size-8" />
            <h2 className="text-2xl font-semibold tracking-tight">Ready for this year&apos;s EPR filing?</h2>
            <p className="max-w-lg text-primary-foreground/80">Set up your company in under five minutes.</p>
            <Button asChild size="lg" variant="secondary" className="h-11 px-6">
              <Link href="/signup">Create your workspace</Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-6 py-6 text-sm text-muted-foreground sm:flex-row">
          <Logo className="text-foreground" />
          <p>Regulatory values must be verified against the latest CPCB notifications.</p>
        </div>
      </footer>
    </div>
  );
}
