"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Financial-year picker that writes ?fy= to the URL. */
export function FySelect({ years, value }: { years: string[]; value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  return (
    <Select
      value={value}
      onValueChange={(fy) => {
        const next = new URLSearchParams(params);
        next.set("fy", fy);
        startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
      }}
    >
      <SelectTrigger aria-label="Financial year" className="min-w-36" aria-busy={pending}>
        <SelectValue>FY {value}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {years.map((y) => (
          <SelectItem key={y} value={y}>
            FY {y}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
