"use client";

import { FileScanIcon, ReceiptTextIcon, RotateCcwIcon, SparklesIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { FormError, FormField } from "@/components/app/form-field";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useFormAction } from "@/hooks/use-form-action";
import type { ActionState } from "@/lib/actions";
import { INDIAN_STATES } from "@/lib/domain/states";
import { cn } from "@/lib/utils";
import { approveInvoiceExtractionAction, rejectExtractionAction, retryExtractionAction, uploadExtractionAction } from "./actions";

const TARGETS = [
  { value: "CERTIFICATE", label: "EPR certificate", hint: "Becomes a certificate draft", icon: FileScanIcon },
  { value: "MATERIAL_ENTRY", label: "Invoice", hint: "Becomes material entries", icon: ReceiptTextIcon },
] as const;

export function UploadExtractionForm({ orgSlug }: { orgSlug: string }) {
  const [state, onSubmit, pending] = useFormAction(uploadExtractionAction.bind(null, orgSlug), {} as ActionState);
  const [target, setTarget] = useState<string>("CERTIFICATE");
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormError message={state.fieldErrors ? undefined : state.error} />
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">What is the document?</legend>
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
          {TARGETS.map((t) => (
            <label
              key={t.value}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors hover:bg-muted/50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                target === t.value && "border-primary bg-brand-soft/40",
              )}
            >
              <input type="radio" name="target" value={t.value} checked={target === t.value} onChange={() => setTarget(t.value)} className="sr-only" />
              <t.icon className="size-5 text-primary" aria-hidden />
              <span className="grid">
                <span className="text-sm font-medium">{t.label}</span>
                <span className="text-xs text-muted-foreground">{t.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <FormField label="Document" htmlFor="extract-file" error={state.fieldErrors?.file} hint="PDF, PNG, JPEG or WebP, up to 4 MB">
        <label
          htmlFor="extract-file"
          className="relative flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors hover:border-primary/50 hover:bg-brand-soft/30"
        >
          <UploadIcon className="size-6 text-primary" aria-hidden />
          <span className="text-sm font-medium">{fileName ?? "Drop a file here or click to browse"}</span>
          <input
            id="extract-file"
            name="file"
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            className="absolute inset-0 cursor-pointer opacity-0"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          />
        </label>
      </FormField>
      <div className="flex justify-end">
        <SubmitButton pending={pending} disabled={!fileName}>
          <SparklesIcon /> Read with AI
        </SubmitButton>
      </div>
    </form>
  );
}

/** Re-renders the page every few seconds while an extraction is still running. */
export function AutoRefresh({ active, intervalMs = 3000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(t);
  }, [active, intervalMs, router]);
  return null;
}

export function ExtractionButtons({ orgSlug, id, canRetry, canDiscard }: { orgSlug: string; id: string; canRetry: boolean; canDiscard: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-wrap gap-2">
      {canRetry && (
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await retryExtractionAction(orgSlug, id);
              if (r.error) toast.error(r.error);
              else toast.success(r.message);
            })
          }
        >
          <RotateCcwIcon /> Read again
        </Button>
      )}
      {canDiscard && (
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => {
            if (!confirm("Discard this document? Nothing will be saved.")) return;
            startTransition(async () => {
              const r = await rejectExtractionAction(orgSlug, id);
              if (r?.error) toast.error(r.error);
            });
          }}
        >
          <Trash2Icon /> Discard
        </Button>
      )}
    </div>
  );
}

export type InvoiceDraftView = {
  month: string | null;
  stateCode: string | null;
  gstRegistrationId: string | null;
  rows: { description: string; categoryId: string | null; quantityKg: number | null; confidence: number; issue: string | null }[];
};

export function InvoiceReviewForm({
  orgSlug,
  extractionId,
  draft,
  options,
  maxMonth,
}: {
  orgSlug: string;
  extractionId: string;
  draft: InvoiceDraftView;
  options: {
    categories: { id: string; name: string }[];
    entityTypes: string[];
    gstins: { id: string; gstin: string; stateCode: string }[];
    brands: { id: string; name: string }[];
  };
  maxMonth: string;
}) {
  const [state, onSubmit, pending] = useFormAction(approveInvoiceExtractionAction.bind(null, orgSlug, extractionId), {} as ActionState);
  const e = state.fieldErrors;
  const [stateCode, setStateCode] = useState(draft.stateCode ?? "");
  const [entityType, setEntityType] = useState(options.entityTypes[0] ?? "");
  const [gst, setGst] = useState(draft.gstRegistrationId ?? "none");
  const [brand, setBrand] = useState("none");
  const [rows, setRows] = useState(
    (draft.rows.length ? draft.rows : [{ description: "", categoryId: null, quantityKg: null, confidence: 0, issue: null }]).map((r) => ({
      ...r,
      include: true,
      categoryId: r.categoryId ?? "",
      kg: r.quantityKg === null ? "" : String(r.quantityKg),
    })),
  );
  const update = (i: number, patch: Partial<(typeof rows)[number]>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const ENTITY: Record<string, string> = { PRODUCER: "Producer", IMPORTER: "Importer", BRAND_OWNER: "Brand Owner" };
  const total = rows.filter((r) => r.include).reduce((s, r) => s + (Number(r.kg) || 0), 0);

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      <FormError message={state.error} />
      <input type="hidden" name="rowCount" value={rows.length} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Month" htmlFor="inv-month" error={e?.month} required hint="Invoice month — when the goods were placed on the market">
          <Input id="inv-month" name="month" type="month" defaultValue={draft.month ?? undefined} max={maxMonth} min="2016-04" />
        </FormField>
        <FormField label="State" htmlFor="inv-state" error={e?.stateCode} required hint="Place of supply">
          <Select name="stateCode" value={stateCode} onValueChange={setStateCode}>
            <SelectTrigger id="inv-state" className="w-full">
              <SelectValue placeholder="Select state">{INDIAN_STATES.find((s) => s.code === stateCode)?.name}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {INDIAN_STATES.map((s) => (
                <SelectItem key={s.code} value={s.code}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Entity type" htmlFor="inv-entity" error={e?.entityType} required>
          <Select name="entityType" value={entityType} onValueChange={setEntityType}>
            <SelectTrigger id="inv-entity" className="w-full">
              <SelectValue>{ENTITY[entityType]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {options.entityTypes.map((t) => (
                <SelectItem key={t} value={t}>
                  {ENTITY[t] ?? t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="GSTIN" htmlFor="inv-gst" error={e?.gstRegistrationId}>
          <Select name="gstRegistrationId" value={gst} onValueChange={setGst}>
            <SelectTrigger id="inv-gst" className="w-full">
              <SelectValue>{gst === "none" ? "No GSTIN" : options.gstins.find((g) => g.id === gst)?.gstin}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No GSTIN</SelectItem>
              {options.gstins.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  <span className="font-mono">{g.gstin}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        {options.brands.length > 0 && (
          <FormField label="Brand" htmlFor="inv-brand" error={e?.brandId}>
            <Select name="brandId" value={brand} onValueChange={setBrand}>
              <SelectTrigger id="inv-brand" className="w-full">
                <SelectValue>{brand === "none" ? "No brand" : options.brands.find((b) => b.id === brand)?.name}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No brand</SelectItem>
                {options.brands.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        )}
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <span className="sr-only">Include</span>
              </TableHead>
              <TableHead>Line</TableHead>
              <TableHead className="w-56">Category</TableHead>
              <TableHead className="w-36">Plastic (kg)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={i} className={cn("align-top", !r.include && "opacity-50")}>
                <TableCell>
                  <Checkbox name={`row-${i}-include`} checked={r.include} onCheckedChange={(v) => update(i, { include: v === true })} aria-label={`Include line ${i + 1}`} />
                </TableCell>
                <TableCell className="whitespace-normal">
                  <input type="hidden" name={`row-${i}-description`} value={r.description} />
                  <div className="text-sm">{r.description || <span className="text-muted-foreground">Line {i + 1}</span>}</div>
                  {r.issue && <div className="text-xs text-status-serious">{r.issue}</div>}
                </TableCell>
                <TableCell>
                  <Select name={`row-${i}-categoryId`} value={r.categoryId} onValueChange={(v) => update(i, { categoryId: v })}>
                    <SelectTrigger aria-label={`Category for line ${i + 1}`} aria-invalid={!!e?.[`row-${i}-categoryId`]} className="w-full">
                      <SelectValue placeholder="Choose">{options.categories.find((c) => c.id === r.categoryId)?.name.split(" – ")[0]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {options.categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {e?.[`row-${i}-categoryId`] && <p className="mt-1 text-xs text-destructive">{e[`row-${i}-categoryId`]![0]}</p>}
                </TableCell>
                <TableCell>
                  <Input
                    name={`row-${i}-quantityKg`}
                    inputMode="decimal"
                    value={r.kg}
                    onChange={(ev) => update(i, { kg: ev.target.value })}
                    aria-label={`Plastic weight in kg for line ${i + 1}`}
                    aria-invalid={!!e?.[`row-${i}-quantityKg`]}
                  />
                  {e?.[`row-${i}-quantityKg`] && <p className="mt-1 text-xs text-destructive">{e[`row-${i}-quantityKg`]![0]}</p>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">
          {rows.filter((r) => r.include).length} line(s) · {total.toLocaleString("en-IN", { maximumFractionDigits: 3 })} kg — lines of the same category are combined into one entry
        </span>
        <SubmitButton pending={pending}>Import to materials</SubmitButton>
      </div>
    </form>
  );
}
