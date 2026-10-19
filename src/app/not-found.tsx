import { SearchXIcon } from "lucide-react";
import Link from "next/link";
import { ErrorState } from "@/components/app/error-state";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="bg-brand-glow flex min-h-svh items-center justify-center">
      <ErrorState
        icon={<SearchXIcon />}
        code="404"
        title="Page not found"
        description="This page doesn't exist, or you don't have access to it. If someone shared this link, ask them to invite you to their organization."
        actions={
          <Button asChild>
            <Link href="/o">Go to my dashboard</Link>
          </Button>
        }
      />
    </div>
  );
}
