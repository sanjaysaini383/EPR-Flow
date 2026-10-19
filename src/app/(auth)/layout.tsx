import { BellRingIcon, ShieldCheckIcon, TargetIcon } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/app/logo";
import { ThemeToggle } from "@/components/app/theme-toggle";

const POINTS = [
  { icon: TargetIcon, title: "Know your obligation", body: "Category-wise EPR targets calculated from your sales data." },
  { icon: ShieldCheckIcon, title: "Trust every certificate", body: "Duplicate and fake recycler certificates flagged automatically." },
  { icon: BellRingIcon, title: "Never miss a deadline", body: "Quarterly and annual return reminders for your whole team." },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-[oklch(0.36_0.09_152)] text-white lg:flex dark:bg-[oklch(0.25_0.06_152)] lg:flex-col lg:justify-between lg:p-12">
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-30" aria-hidden />
        <div
          className="pointer-events-none absolute -top-40 -right-40 size-[32rem] rounded-full bg-white/10 blur-3xl"
          aria-hidden
        />
        <Link href="/" className="relative" aria-label="EPRFlow home">
          <Logo className="text-lg [&>span:first-child]:bg-white/15" />
        </Link>
        <div className="relative max-w-md space-y-8">
          <h2 className="text-3xl leading-tight font-semibold tracking-tight">
            EPR compliance for Plastic, E-Waste and Battery rules — in one place.
          </h2>
          <ul className="space-y-5">
            {POINTS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/15">
                  <Icon className="size-4" />
                </span>
                <span>
                  <span className="block font-medium">{title}</span>
                  <span className="text-sm text-white/75">{body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/60">
          Your data is isolated per organization, encrypted in transit and every change is audit-logged.
        </p>
      </aside>

      <main className="bg-brand-glow relative flex flex-col items-center justify-center gap-6 p-6 sm:p-10">
        <div className="absolute top-4 right-4 flex items-center gap-2">
          <ThemeToggle />
        </div>
        <Link href="/" aria-label="EPRFlow home" className="lg:hidden">
          <Logo className="text-lg" />
        </Link>
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
