"use client";

import { XIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Option = { value: string; label: string };

/** URL-driven audit filters, so a filtered view can be shared and exported. */
export function AuditFilterControls({ entities, people }: { entities: Option[]; people: Option[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function set(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (!value || value === "all") next.delete(key);
    else next.set(key, value);
    next.delete("page");
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  const entity = params.get("entity") ?? "all";
  const actor = params.get("actor") ?? "all";
  const filtered = ["entity", "actor", "from", "to"].some((k) => params.has(k));

  return (
    <div className="flex flex-wrap items-end gap-3" aria-busy={pending}>
      <div className="grid gap-1.5">
        <Label className="text-xs text-muted-foreground">Record type</Label>
        <Select value={entity} onValueChange={(v) => set("entity", v)}>
          <SelectTrigger aria-label="Record type" size="sm" className="min-w-40">
            <SelectValue>{entity === "all" ? "All record types" : (entities.find((e) => e.value === entity)?.label ?? entity)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All record types</SelectItem>
            {entities.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs text-muted-foreground">Person</Label>
        <Select value={actor} onValueChange={(v) => set("actor", v)}>
          <SelectTrigger aria-label="Person" size="sm" className="min-w-44">
            <SelectValue>{actor === "all" ? "Everyone" : (people.find((p) => p.value === actor)?.label ?? "Former member")}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Everyone</SelectItem>
            {people.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="audit-from" className="text-xs text-muted-foreground">
          From
        </Label>
        <Input id="audit-from" type="date" className="h-8 w-40" defaultValue={params.get("from") ?? ""} onChange={(e) => set("from", e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="audit-to" className="text-xs text-muted-foreground">
          To
        </Label>
        <Input id="audit-to" type="date" className="h-8 w-40" defaultValue={params.get("to") ?? ""} onChange={(e) => set("to", e.target.value)} />
      </div>
      {filtered && (
        <Button variant="ghost" size="sm" onClick={() => startTransition(() => router.replace(pathname, { scroll: false }))}>
          <XIcon /> Clear filters
        </Button>
      )}
    </div>
  );
}
