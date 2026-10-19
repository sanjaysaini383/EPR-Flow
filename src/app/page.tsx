import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/app/logo";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";

// Minimal home page; the full marketing site with pricing ships in phase 7.
export default async function HomePage() {
  if (await getCurrentUser()) redirect("/o");

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-16 items-center justify-between px-6">
        <Logo />
        <Button asChild variant="ghost">
          <Link href="/login">Log in</Link>
        </Button>
      </header>
      <main className="mx-auto flex max-w-3xl flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">EPR compliance without the spreadsheets</h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          Track plastic, e-waste and battery obligations, verify recycler certificates and never miss a CPCB deadline.
        </p>
        <div className="flex gap-3">
          <Button asChild size="lg">
            <Link href="/signup">Get started</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/login">Log in</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
