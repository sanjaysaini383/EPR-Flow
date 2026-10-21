/**
 * Plans shown on the landing and pricing pages and in organisation settings.
 * Prices are indicative (INR per organisation per year, excluding GST) and limits
 * are informational for now — billing is not connected yet.
 */
export type PlanId = "STARTER" | "GROWTH" | "ENTERPRISE";

export type PlanSpec = {
  id: PlanId;
  name: string;
  tagline: string;
  price: string;
  period: string;
  cta: { label: string; href: string };
  highlight?: boolean;
  features: string[];
};

export const PLANS: PlanSpec[] = [
  {
    id: "STARTER",
    name: "Starter",
    tagline: "For a single brand owner getting off spreadsheets",
    price: "₹24,000",
    period: "per year",
    cta: { label: "Start free for 30 days", href: "/signup" },
    features: [
      "1 waste stream (plastic packaging)",
      "Up to 2 GSTINs and 3 team members",
      "Material entry and Excel / CSV import",
      "Automatic EPR targets and EC risk",
      "Compliance calendar with email reminders",
      "CPCB annual return in Excel and PDF",
    ],
  },
  {
    id: "GROWTH",
    name: "Growth",
    tagline: "For multi-state producers buying certificates every quarter",
    price: "₹72,000",
    period: "per year",
    cta: { label: "Start free for 30 days", href: "/signup" },
    highlight: true,
    features: [
      "Everything in Starter",
      "Plastic, e-waste and battery streams",
      "Unlimited GSTINs, brands, plants; 15 members",
      "Certificate workflow with fraud checks",
      "AI extraction — 500 documents a year",
      "Recycler directory, ratings and price history",
      "Budgets, audit log export, registers",
    ],
  },
  {
    id: "ENTERPRISE",
    name: "Enterprise",
    tagline: "For groups and EPR consultants managing many companies",
    price: "Custom",
    period: "annual contract",
    cta: { label: "Talk to us", href: "mailto:sales@eprflow.in?subject=EPRFlow%20Enterprise" },
    features: [
      "Everything in Growth",
      "Consultant view across all client companies",
      "Unlimited members and AI extraction",
      "Onboarding and data migration support",
      "Priority support with a named contact",
      "Custom reports and data retention terms",
    ],
  },
];

export function planName(id: string) {
  return PLANS.find((p) => p.id === id)?.name ?? id;
}
