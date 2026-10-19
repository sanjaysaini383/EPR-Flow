"use client";

import { TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { ErrorState } from "@/components/app/error-state";
import { Button } from "@/components/ui/button";

/** Shown when a page throws. Never displays error details — only the reference id (digest). */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60svh] items-center justify-center">
      <ErrorState
        icon={<TriangleAlertIcon />}
        title="Something went wrong"
        description={
          <>
            We couldn&apos;t load this page. Please try again — if it keeps happening, contact support
            {error.digest ? (
              <>
                {" "}
                with reference <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{error.digest}</code>
              </>
            ) : null}
            .
          </>
        }
        actions={
          <>
            <Button onClick={reset}>Try again</Button>
            <Button asChild variant="outline">
              <Link href="/o">Go to dashboard</Link>
            </Button>
          </>
        }
      />
    </div>
  );
}
