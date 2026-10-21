import { CheckIcon } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PLANS } from "@/lib/pricing";
import { cn } from "@/lib/utils";

export function PricingCards() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {PLANS.map((plan) => (
        <div
          key={plan.id}
          className={cn("relative flex flex-col gap-6 rounded-2xl border bg-card p-6", plan.highlight && "border-primary shadow-lg ring-1 ring-primary/30")}
        >
          {plan.highlight && <Badge className="absolute -top-3 left-6">Most popular</Badge>}
          <div className="grid gap-1">
            <h3 className="text-lg font-semibold">{plan.name}</h3>
            <p className="text-sm text-muted-foreground">{plan.tagline}</p>
          </div>
          <p className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold tracking-tight tabular-nums">{plan.price}</span>
            <span className="text-sm text-muted-foreground">{plan.period}</span>
          </p>
          <ul className="grid flex-1 content-start gap-2.5 text-sm">
            {plan.features.map((f) => (
              <li key={f} className="flex gap-2">
                <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                {f}
              </li>
            ))}
          </ul>
          <Button asChild variant={plan.highlight ? "default" : "outline"} className="w-full">
            {plan.cta.href.startsWith("mailto:") ? <a href={plan.cta.href}>{plan.cta.label}</a> : <Link href={plan.cta.href}>{plan.cta.label}</Link>}
          </Button>
        </div>
      ))}
    </div>
  );
}
