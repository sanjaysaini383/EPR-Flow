import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/app/logo";
import { listUserOrganizations, requireUser } from "@/lib/auth/session";
import { OnboardingWizard } from "./wizard";

export const metadata: Metadata = { title: "Set up your company" };

export default async function OnboardingPage() {
  const user = await requireUser("/onboarding");
  const orgs = await listUserOrganizations(user.id);

  return (
    <div className="min-h-svh bg-muted/40">
      <header className="flex h-14 items-center justify-between border-b bg-background px-6">
        <Logo />
        {orgs.length > 0 && (
          <Link href="/o" className="text-sm text-muted-foreground hover:text-foreground">
            Back to my organizations
          </Link>
        )}
      </header>
      <main className="mx-auto max-w-2xl px-6 py-10">
        <div className="mb-8 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Set up your company</h1>
          <p className="text-sm text-muted-foreground">
            A few details about how you place products on the Indian market. You can change all of this later.
          </p>
        </div>
        <OnboardingWizard />
      </main>
    </div>
  );
}
