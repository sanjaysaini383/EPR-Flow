"use client";

import { DownloadIcon, LoaderCircleIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Downloads a generated report. Fetches first so errors (rate limit, bad
 * request) appear as a toast instead of navigating to a JSON error page.
 */
export function DownloadButton({ href, label, variant = "outline" }: { href: string; label: string; variant?: "outline" | "default" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const res = await fetch(href, { credentials: "same-origin" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast.error(body?.error ?? "The report could not be generated. Please try again.");
        return;
      }
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "report";
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.success(`Downloaded ${name}`);
      router.refresh();
    } catch {
      toast.error("Network error — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant={variant} size="sm" onClick={download} disabled={busy} aria-busy={busy}>
      {busy ? <LoaderCircleIcon className="animate-spin" /> : <DownloadIcon />}
      {label}
    </Button>
  );
}
