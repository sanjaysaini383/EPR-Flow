"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FormError, FormField } from "@/components/app/form-field";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useFormAction } from "@/hooks/use-form-action";
import type { ActionState } from "@/lib/actions";
import { INDIAN_STATES, stateName } from "@/lib/domain/states";
import { formatKg, formatTonnes, parseNumber, toKg } from "@/lib/domain/units";
import { saveMaterialEntryAction } from "./actions";

const ENTITY_LABELS: Record<string, string> = { PRODUCER: "Producer", IMPORTER: "Importer", BRAND_OWNER: "Brand Owner" };
const STREAM_LABELS: Record<string, string> = { PLASTIC: "Plastic packaging", EWASTE: "E-waste", BATTERY: "Batteries" };

export type EntryFormOptions = {
  categories: { id: string; name: string; stream: string }[];
  entityTypes: string[];
  brands: { id: string; name: string }[];
  plants: { id: string; name: string; stateCode: string }[];
  gstins: { id: string; gstin: string; stateCode: string }[];
};

export type EntryDefaults = {
  month: string; // "2025-07"
  categoryId?: string;
  entityType?: string;
  stateCode?: string;
  brandId?: string | null;
  plantId?: string | null;
  gstRegistrationId?: string | null;
  quantityKg?: string;
  recycledContentKg?: string | null;
  isPreConsumer?: boolean;
  notes?: string | null;
};

export function MaterialEntryForm({
  orgSlug,
  entryId,
  options,
  defaults,
  maxMonth,
}: {
  orgSlug: string;
  entryId?: string;
  options: EntryFormOptions;
  defaults: EntryDefaults;
  maxMonth: string;
}) {
  const router = useRouter();
  const [state, onSubmit, pending] = useFormAction(saveMaterialEntryAction.bind(null, orgSlug, entryId ?? null), {} as ActionState);
  const e = state.fieldErrors;

  const [stateCode, setStateCode] = useState(defaults.stateCode ?? "");
  const [gstId, setGstId] = useState(defaults.gstRegistrationId ?? "none");
  const [quantity, setQuantity] = useState(defaults.quantityKg ? String(Number(defaults.quantityKg)) : "");
  const [unit, setUnit] = useState<"kg" | "tonne">("kg");

  useEffect(() => {
    if (state.ok) {
      toast.success(state.message);
      router.push(`/o/${orgSlug}/materials`);
      router.refresh();
    }
  }, [state, router, orgSlug]);

  const qty = parseNumber(quantity);
  const kg = qty === null ? null : toKg(qty, unit);
  const streams = [...new Set(options.categories.map((c) => c.stream))];

  return (
    <form onSubmit={onSubmit} noValidate>
      <Card>
        <CardContent className="grid gap-6">
          <FormError message={state.error} />

          <section className="grid gap-4 sm:grid-cols-2">
            <FormField label="Month" htmlFor="month" error={e?.month} required hint="The month the material was placed on the market">
              <Input id="month" name="month" type="month" defaultValue={defaults.month} max={maxMonth} min="2016-04" />
            </FormField>
            <FormField label="Category" htmlFor="categoryId" error={e?.categoryId} required>
              <Select name="categoryId" defaultValue={defaults.categoryId}>
                <SelectTrigger id="categoryId" className="w-full">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {streams.map((stream) => (
                    <SelectGroup key={stream}>
                      <SelectLabel>{STREAM_LABELS[stream] ?? stream}</SelectLabel>
                      {options.categories
                        .filter((c) => c.stream === stream)
                        .map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Entity type" htmlFor="entityType" error={e?.entityType} required hint="The capacity in which you introduced it">
              <Select name="entityType" defaultValue={defaults.entityType ?? (options.entityTypes.length === 1 ? options.entityTypes[0] : undefined)}>
                <SelectTrigger id="entityType" className="w-full">
                  <SelectValue placeholder="Select entity type" />
                </SelectTrigger>
                <SelectContent>
                  {options.entityTypes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {ENTITY_LABELS[t] ?? t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="State" htmlFor="stateCode" error={e?.stateCode} required>
              <Select name="stateCode" value={stateCode} onValueChange={setStateCode}>
                <SelectTrigger id="stateCode" className="w-full">
                  <SelectValue placeholder="Select state" />
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
          </section>

          <section className="grid gap-4 sm:grid-cols-3">
            <FormField label="Brand" htmlFor="brandId" error={e?.brandId}>
              <Select name="brandId" defaultValue={defaults.brandId ?? "none"}>
                <SelectTrigger id="brandId" className="w-full">
                  <SelectValue />
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
            <FormField label="Plant" htmlFor="plantId" error={e?.plantId}>
              <Select
                name="plantId"
                defaultValue={defaults.plantId ?? "none"}
                onValueChange={(v) => {
                  const plant = options.plants.find((p) => p.id === v);
                  if (plant && !stateCode) setStateCode(plant.stateCode);
                }}
              >
                <SelectTrigger id="plantId" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No plant</SelectItem>
                  {options.plants.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="GSTIN" htmlFor="gstRegistrationId" error={e?.gstRegistrationId} hint="Sets the state automatically">
              <Select
                name="gstRegistrationId"
                value={gstId}
                onValueChange={(v) => {
                  setGstId(v);
                  const gst = options.gstins.find((g) => g.id === v);
                  if (gst) setStateCode(gst.stateCode);
                }}
              >
                <SelectTrigger id="gstRegistrationId" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No GSTIN</SelectItem>
                  {options.gstins.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      <span className="font-mono">{g.gstin}</span> · {stateName(g.stateCode)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </section>

          <section className="grid gap-4 sm:grid-cols-[1fr_140px_1fr]">
            <FormField
              label="Quantity placed on market"
              htmlFor="quantity"
              error={e?.quantity}
              required
              hint={kg !== null && kg > 0 ? `= ${formatKg(kg)} · ${formatTonnes(kg)}` : "Weight of packaging / product"}
            >
              <Input id="quantity" name="quantity" inputMode="decimal" value={quantity} onChange={(ev) => setQuantity(ev.target.value)} />
            </FormField>
            <FormField label="Unit" htmlFor="unit" error={e?.unit}>
              <Select name="unit" value={unit} onValueChange={(v) => setUnit(v as "kg" | "tonne")}>
                <SelectTrigger id="unit" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kg">kg</SelectItem>
                  <SelectItem value="tonne">tonnes</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Recycled content (same unit)" htmlFor="recycledContent" error={e?.recycledContent} hint="Optional">
              <Input
                id="recycledContent"
                name="recycledContent"
                inputMode="decimal"
                defaultValue={defaults.recycledContentKg ? String(Number(defaults.recycledContentKg)) : ""}
              />
            </FormField>
          </section>

          <Label className="flex items-start gap-2 font-normal">
            <Checkbox name="isPreConsumer" defaultChecked={defaults.isPreConsumer} className="mt-0.5" />
            <span className="grid gap-0.5">
              <span>Pre-consumer waste</span>
              <span className="text-xs text-muted-foreground">Material that never reached consumers (e.g. rejects, scrap).</span>
            </span>
          </Label>

          <FormField label="Notes" htmlFor="notes" error={e?.notes}>
            <Textarea id="notes" name="notes" rows={2} defaultValue={defaults.notes ?? ""} />
          </FormField>
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button asChild variant="ghost">
            <Link href={`/o/${orgSlug}/materials`}>Cancel</Link>
          </Button>
          <SubmitButton pending={pending}>{entryId ? "Save changes" : "Add entry"}</SubmitButton>
        </CardFooter>
      </Card>
    </form>
  );
}
