"use client";

import "./globals.css";

/** Last-resort boundary when the root layout itself fails. Must render its own <html>. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en-IN">
      <body className="flex min-h-svh items-center justify-center p-6 font-sans">
        <div className="max-w-md space-y-4 text-center">
          <h1 className="text-2xl font-semibold">EPRFlow is temporarily unavailable</h1>
          <p className="text-sm text-muted-foreground">
            Please try again in a moment.
            {error.digest && <> Reference: <code>{error.digest}</code></>}
          </p>
          <button onClick={reset} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
