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
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PricingCards } from "@/components/marketing/pricing-cards";
import { SiteFooter, SiteHeader } from "@/components/marketing/site-chrome";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: { absolute: "EPRFlow — EPR compliance for Indian brands" },
  description: "Track EPR obligations, verify recycler certificates, read invoices with AI and file CPCB returns on time — for plastic, e-waste and battery producers.",
};

const FEATURES = [
  {
    icon: TargetIcon,
    title: "Automatic EPR targets",
    body: "Category-wise obligations calculated from your sales data using versioned, configurable CPCB rules — with the exact rule version behind every number.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Certificate fraud checks",
    body: "Numbers already claimed elsewhere, unverified or suspended recyclers, capacity breaches, odd dates and outlier prices flagged before you approve.",
  },
  {
    icon: ScanTextIcon,
    title: "AI document reading",
    body: "Upload a certificate or an invoice. AI reads it; you check each value next to the document and approve — nothing is saved blindly.",
  },
  {
    icon: BellRingIcon,
    title: "Deadlines that remind you",
    body: "Statutory filing dates and your own deadlines on one calendar, with email reminders and ready-to-send WhatsApp messages.",
  },
  {
    icon: FileSpreadsheetIcon,
    title: "CPCB-ready reports",
    body: "Annual return, obligation summary and registers in Excel or PDF, each fingerprinted and recorded so auditors can trust them.",
  },
  {
    icon: Building2Icon,
    title: "Multi-brand, multi-state, multi-client",
    body: "Brands, plants and GSTINs across states in one workspace. Consultants see every client company on one screen.",
  },
];

const STEPS = [
  { n: "1", title: "Add your sales data", body: "Import the dispatch sheet you already maintain, or upload invoices for AI to read. Every row is validated before it is saved." },
  { n: "2", title: "See what you owe", body: "Targets, remaining obligation and Environmental Compensation risk per category update as soon as data or certificates change." },
  { n: "3", title: "Buy, verify and file", body: "Record certificates, let the checks catch bad ones, and export the annual return when the year closes." },
];

const FAQ = [
  {
    q: "Which EPR rules does EPRFlow cover?",
    a: "Plastic Waste Management (EPR guidelines 2022), E-Waste (Management) Rules 2022 and Battery Waste Management Rules 2022. Targets, EC rates and filing dates are stored as versioned rules, so a new CPCB notification is a data update, not a software release.",
  },
  {
    q: "Are the regulatory numbers correct?",
    a: "Rule values ship as clearly marked placeholders until they are verified against the latest CPCB notification by an administrator. Every screen that uses an unverified value says so.",
  },
  {
    q: "Is our data visible to other companies?",
    a: "No. Every query is scoped to your organisation. Cross-company checks (like a certificate number already claimed elsewhere) only use anonymous counts and never reveal who.",
  },
  {
    q: "Do we need an AI subscription?",
    a: "No. AI reading is included in Growth and Enterprise; on any plan you can enter values by hand next to the uploaded document.",
  },
  {
    q: "Can our EPR consultant use it?",
    a: "Yes. Invite them as a Consultant. They can work in several client companies from one login, and Enterprise adds a single view across all clients.",
  },
];

export default async function HomePage() {
  if (await getCurrentUser()) redirect("/o");

  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />

      <main className="flex-1">
        <section className="bg-brand-glow relative overflow-hidden">
          <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" aria-hidden />
          <div className="relative mx-auto flex max-w-4xl flex-col items-center gap-6 px-4 pt-20 pb-24 text-center sm:px-6 sm:pt-28">
            <Badge variant="outline" className="gap-1.5 bg-background/60 px-3 py-1 backdrop-blur">
              <span className="size-1.5 rounded-full bg-primary" /> Built for PWM, E-Waste & Battery Rules 2022
            </Badge>
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
              EPR compliance <span className="text-primary">without the spreadsheets</span>
            </h1>
            <p className="max-w-2xl text-lg text-pretty text-muted-foreground">
              Know your obligation, trust every certificate and never miss a deadline — across every brand, plant and state. Built for compliance teams at Indian producers,
              importers and brand owners, and the consultants who support them.
            </p>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Button asChild size="lg" className="h-11 px-6">
                <Link href="/signup">
                  Start free <ArrowRightIcon />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-11 bg-background/60 px-6">
                <Link href="/pricing">See pricing</Link>
              </Button>
            </div>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight">Everything your EPR filing needs</h2>
            <p className="mt-3 text-muted-foreground">From the first invoice to the CPCB annual return.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-xl border bg-card p-6 transition-colors hover:border-primary/40 hover:bg-brand-soft/40">
                <span className="mb-4 flex size-10 items-center justify-center rounded-lg bg-brand-soft text-primary">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="font-medium">{title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-y bg-muted/30">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <h2 className="mb-10 text-center text-3xl font-semibold tracking-tight">How it works</h2>
            <ol className="grid gap-6 md:grid-cols-3">
              {STEPS.map((s) => (
                <li key={s.n} className="grid gap-2">
                  <span className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground" aria-hidden>
                    {s.n}
                  </span>
                  <h3 className="font-medium">{s.title}</h3>
                  <p className="text-sm text-muted-foreground">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight">Simple, annual pricing</h2>
            <p className="mt-3 text-muted-foreground">Per company, billed yearly. One avoided Environmental Compensation notice usually covers it.</p>
          </div>
          <PricingCards />
          <p className="mt-6 text-center text-xs text-muted-foreground">Indicative prices in INR, excluding GST.</p>
        </section>

        <section className="mx-auto max-w-3xl px-4 pb-20 sm:px-6">
          <h2 className="mb-6 text-center text-3xl font-semibold tracking-tight">Questions</h2>
          <div className="divide-y rounded-xl border bg-card">
            {FAQ.map((f) => (
              <details key={f.q} className="group p-5 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {f.q}
                  <span className="text-muted-foreground transition-transform group-open:rotate-45" aria-hidden>
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
          <div className="flex flex-col items-center gap-4 rounded-2xl border bg-primary px-6 py-12 text-center text-primary-foreground">
            <FileCheck2Icon className="size-8" aria-hidden />
            <h2 className="text-2xl font-semibold tracking-tight">Ready for this year&apos;s EPR filing?</h2>
            <p className="max-w-lg text-primary-foreground/80">Set up your company in under five minutes.</p>
            <Button asChild size="lg" variant="secondary" className="h-11 px-6">
              <Link href="/signup">Create your workspace</Link>
            </Button>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
