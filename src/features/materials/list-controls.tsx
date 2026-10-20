"use client";

import { MoreHorizontalIcon, PencilIcon, Trash2Icon, XIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { deleteMaterialEntryAction } from "./actions";

type Option = { value: string; label: string };

/** URL-driven filters: every change updates the query string, so views are shareable. */
export function MaterialFilters({
  years,
  categories,
  states,
  brands,
}: {
  years: string[];
  categories: Option[];
  states: Option[];
  brands: Option[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function set(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value === "all") next.delete(key);
    else next.set(key, value);
    next.delete("page");
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  const filtered = ["category", "state", "brand", "source"].some((k) => params.has(k));

  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={pending}>
      <FilterSelect label="Financial year" value={params.get("fy") ?? years[0]} options={years.map((y) => ({ value: y, label: `FY ${y}` }))} onChange={(v) => set("fy", v)} />
      <FilterSelect label="Category" value={params.get("category") ?? "all"} options={categories} allLabel="All categories" onChange={(v) => set("category", v)} />
      <FilterSelect label="State" value={params.get("state") ?? "all"} options={states} allLabel="All states" onChange={(v) => set("state", v)} />
      {brands.length > 0 && (
        <FilterSelect label="Brand" value={params.get("brand") ?? "all"} options={brands} allLabel="All brands" onChange={(v) => set("brand", v)} />
      )}
      <FilterSelect
        label="Source"
        value={params.get("source") ?? "all"}
        options={[
          { value: "MANUAL", label: "Manual" },
          { value: "IMPORT", label: "Import" },
        ]}
        allLabel="All sources"
        onChange={(v) => set("source", v)}
      />
      {filtered && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            const fy = params.get("fy");
            startTransition(() => router.replace(fy ? `${pathname}?fy=${fy}` : pathname, { scroll: false }));
          }}
        >
          <XIcon /> Clear filters
        </Button>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  allLabel,
  onChange,
}: {
  label: string;
  value: string;
  options: Option[];
  allLabel?: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} size="sm" className="min-w-36">
        <SelectValue>{value === "all" ? allLabel : options.find((o) => o.value === value)?.label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {allLabel && <SelectItem value="all">{allLabel}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function EntryActions({ orgSlug, id }: { orgSlug: string; id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Entry actions" disabled={pending}>
          <MoreHorizontalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={`/o/${orgSlug}/materials/${id}`}>
            <PencilIcon /> Edit
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => {
            if (!confirm("Delete this entry? It is kept in the audit log.")) return;
            startTransition(async () => {
              const r = await deleteMaterialEntryAction(orgSlug, id);
              if (r.error) toast.error(r.error);
              else toast.success(r.message);
            });
          }}
        >
          <Trash2Icon /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
