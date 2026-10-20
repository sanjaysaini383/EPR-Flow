"use client";

import { PencilIcon, PlusIcon } from "lucide-react";
import { FormField } from "@/components/app/form-field";
import { RecordDialog } from "@/components/app/record-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { INDIAN_STATES, stateName } from "@/lib/domain/states";
import { saveBrandAction, saveGstRegistrationAction, savePlantAction } from "./actions";

/** Rendered inside DialogTrigger asChild, so it must forward the injected props (onClick, aria-*, ref). */
function Trigger({ edit, label, ...props }: { edit: boolean; label: string } & React.ComponentProps<typeof Button>) {
  return edit ? (
    <Button variant="ghost" size="sm" {...props}>
      <PencilIcon /> Edit
    </Button>
  ) : (
    <Button {...props}>
      <PlusIcon /> {label}
    </Button>
  );
}

export function BrandDialog({
  orgSlug,
  brand,
}: {
  orgSlug: string;
  brand?: { id: string; name: string; description: string | null };
}) {
  return (
    <RecordDialog
      trigger={<Trigger edit={!!brand} label="Add brand" />}
      title={brand ? "Edit brand" : "Add brand"}
      description="Brands let you split material data and reports."
      submitLabel={brand ? "Save" : "Add brand"}
      action={saveBrandAction.bind(null, orgSlug, brand?.id ?? null)}
    >
      {(errors) => (
        <>
          <FormField label="Brand name" htmlFor="brand-name" error={errors?.name} required>
            <Input id="brand-name" name="name" defaultValue={brand?.name} autoFocus />
          </FormField>
          <FormField label="Description" htmlFor="brand-description" error={errors?.description}>
            <Input id="brand-description" name="description" defaultValue={brand?.description ?? ""} />
          </FormField>
        </>
      )}
    </RecordDialog>
  );
}

export function GstDialog({
  orgSlug,
  registration,
}: {
  orgSlug: string;
  registration?: { id: string; gstin: string; legalName: string | null; tradeName: string | null };
}) {
  return (
    <RecordDialog
      trigger={<Trigger edit={!!registration} label="Add GSTIN" />}
      title={registration ? "Edit GST registration" : "Add GST registration"}
      description="The GSTIN is checked with the official checksum; the state is detected automatically."
      submitLabel={registration ? "Save" : "Add GSTIN"}
      action={saveGstRegistrationAction.bind(null, orgSlug, registration?.id ?? null)}
    >
      {(errors) => (
        <>
          <FormField label="GSTIN" htmlFor="gst-gstin" error={errors?.gstin} required hint="15 characters, e.g. 27AAACD1234F1Z5">
            <Input
              id="gst-gstin"
              name="gstin"
              defaultValue={registration?.gstin}
              className="font-mono uppercase"
              maxLength={15}
              autoFocus
            />
          </FormField>
          <FormField label="Legal name" htmlFor="gst-legal" error={errors?.legalName}>
            <Input id="gst-legal" name="legalName" defaultValue={registration?.legalName ?? ""} />
          </FormField>
          <FormField label="Trade name" htmlFor="gst-trade" error={errors?.tradeName}>
            <Input id="gst-trade" name="tradeName" defaultValue={registration?.tradeName ?? ""} />
          </FormField>
        </>
      )}
    </RecordDialog>
  );
}

export function PlantDialog({
  orgSlug,
  plant,
  gstins,
}: {
  orgSlug: string;
  plant?: {
    id: string;
    name: string;
    stateCode: string;
    city: string | null;
    address: string | null;
    pincode: string | null;
    gstRegistrationId: string | null;
  };
  gstins: { id: string; gstin: string; stateCode: string }[];
}) {
  return (
    <RecordDialog
      trigger={<Trigger edit={!!plant} label="Add plant" />}
      title={plant ? "Edit plant" : "Add plant"}
      description="Manufacturing units, warehouses or distribution centres."
      submitLabel={plant ? "Save" : "Add plant"}
      action={savePlantAction.bind(null, orgSlug, plant?.id ?? null)}
    >
      {(errors) => (
        <>
          <FormField label="Plant name" htmlFor="plant-name" error={errors?.name} required>
            <Input id="plant-name" name="name" defaultValue={plant?.name} autoFocus />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="State" htmlFor="plant-state" error={errors?.stateCode} required>
              <Select name="stateCode" defaultValue={plant?.stateCode}>
                <SelectTrigger id="plant-state" className="w-full">
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
            <FormField label="City" htmlFor="plant-city" error={errors?.city}>
              <Input id="plant-city" name="city" defaultValue={plant?.city ?? ""} />
            </FormField>
          </div>
          <FormField label="Address" htmlFor="plant-address" error={errors?.address}>
            <Textarea id="plant-address" name="address" rows={2} defaultValue={plant?.address ?? ""} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="PIN code" htmlFor="plant-pin" error={errors?.pincode}>
              <Input id="plant-pin" name="pincode" inputMode="numeric" maxLength={6} defaultValue={plant?.pincode ?? ""} />
            </FormField>
            <FormField label="GSTIN" htmlFor="plant-gst" error={errors?.gstRegistrationId} hint="Must be in the plant's state">
              <Select name="gstRegistrationId" defaultValue={plant?.gstRegistrationId ?? "none"}>
                <SelectTrigger id="plant-gst" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {gstins.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      <span className="font-mono">{g.gstin}</span> · {stateName(g.stateCode)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </div>
        </>
      )}
    </RecordDialog>
  );
}
